use std::collections::BTreeMap;
use std::io::Read;

use base64::Engine;
use ostrya_core::filehdr::{ContentHasher, FileHeader};
use ostrya_core::{commit_metadata, Checksum, Commit, DirMeta, DirTree, Xattrs};
use ostrya_gvariant::{encode_to_vec, from_bytes, to_bytes, GvEncode, GvType, Slice, Type, Value};
use wasm_bindgen::prelude::*;

struct FileEntry {
    data: Vec<u8>,
    mode: u32,
}

#[derive(Default)]
struct DirEntry {
    files: BTreeMap<String, FileEntry>,
    dirs: BTreeMap<String, DirEntry>,
}

fn normalize(path: &str) -> Option<String> {
    let path = path.trim_start_matches("./").trim_end_matches('/');
    if path.is_empty() || path == "." {
        return None;
    }
    Some(path.to_string())
}

fn insert(root: &mut DirEntry, path: &str, file: FileEntry) {
    let parts: Vec<&str> = path.split('/').collect();
    let mut current = root;
    for part in &parts[..parts.len() - 1] {
        current = current.dirs.entry((*part).to_string()).or_default();
    }
    current.files.insert(parts[parts.len() - 1].to_string(), file);
}

fn read_tree(tar: &[u8]) -> Result<DirEntry, String> {
    let mut archive = tar::Archive::new(std::io::Cursor::new(tar));
    let mut root = DirEntry::default();
    let mut seen: BTreeMap<String, Vec<u8>> = BTreeMap::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = normalize(&path.to_string_lossy()).unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            continue;
        }
        let mode = entry.header().mode().map_err(|e| e.to_string())?;
        let mut data = Vec::new();
        if kind.is_symlink() {
            return Err("symlinks are not supported".into());
        }
        if kind.is_hard_link() {
            let target = entry
                .link_name()
                .map_err(|e| e.to_string())?
                .ok_or("hardlink without target")?
                .to_string_lossy()
                .to_string();
            let target = normalize(&target).ok_or("invalid hardlink target")?;
            data = seen.get(&target).ok_or("hardlink target not seen")?.clone();
        } else {
            entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        }
        let file = FileEntry {
            data: data.clone(),
            mode: if mode == 0 { 0o644 } else { mode },
        };
        seen.insert(name.clone(), data);
        insert(&mut root, &name, file);
    }
    Ok(root)
}

struct Be32(u32);
impl GvType for Be32 {
    const SIGNATURE: &'static str = "u";
    const ALIGNMENT: usize = 4;
    const FIXED_SIZE: Option<usize> = Some(4);
}
impl GvEncode for Be32 {
    fn encode(&self, out: &mut Vec<u8>) -> ostrya_gvariant::Result<()> {
        out.extend_from_slice(&self.0.to_be_bytes());
        Ok(())
    }
}

struct OneEmptyXattrs;
impl GvType for OneEmptyXattrs {
    const SIGNATURE: &'static str = "aa(ayay)";
    const ALIGNMENT: usize = 1;
    const FIXED_SIZE: Option<usize> = None;
}
impl GvEncode for OneEmptyXattrs {
    fn encode(&self, out: &mut Vec<u8>) -> ostrya_gvariant::Result<()> {
        // One empty a(ayay) element: a one-byte framing offset of zero.
        out.push(0);
        Ok(())
    }
}

struct PartPayload<'a> {
    modes: &'a [(Be32, Be32, Be32)],
    data: &'a [u8],
    operations: &'a [u8],
}
impl GvType for PartPayload<'_> {
    const SIGNATURE: &'static str = "(a(uuu)aa(ayay)ayay)";
    const ALIGNMENT: usize = 4;
    const FIXED_SIZE: Option<usize> = None;
}
impl GvEncode for PartPayload<'_> {
    fn encode(&self, out: &mut Vec<u8>) -> ostrya_gvariant::Result<()> {
        (
            Slice(self.modes),
            OneEmptyXattrs,
            self.data,
            self.operations,
        )
            .encode(out)
    }
}

#[derive(Default)]
struct Part {
    raw: Vec<u8>,
    operations: Vec<u8>,
    modes: Vec<(Be32, Be32, Be32)>,
    objects: Vec<(u8, Checksum)>,
    uncompressed: u64,
}

fn varint(mut value: u64, out: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

impl Part {
    fn add_meta(&mut self, object_type: u8, bytes: &[u8], checksum: Checksum) {
        let offset = self.raw.len() as u64;
        self.raw.extend_from_slice(bytes);
        self.operations.push(b'S');
        varint(bytes.len() as u64, &mut self.operations);
        varint(offset, &mut self.operations);
        self.objects.push((object_type, checksum));
        self.uncompressed += bytes.len() as u64;
    }

    fn add_file(&mut self, bytes: &[u8], mode: u32, checksum: Checksum) {
        let mode_index = self.modes.len() as u64;
        self.modes.push((Be32(0), Be32(0), Be32(mode)));
        let offset = self.raw.len() as u64;
        self.raw.extend_from_slice(bytes);
        self.operations.push(b'S');
        varint(mode_index, &mut self.operations);
        varint(0, &mut self.operations);
        varint(bytes.len() as u64, &mut self.operations);
        varint(offset, &mut self.operations);
        self.objects.push((1, checksum));
        self.uncompressed += bytes.len() as u64;
    }

    fn object_list(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(self.objects.len() * 33);
        for (object_type, checksum) in &self.objects {
            out.push(*object_type);
            out.extend_from_slice(&checksum.as_bytes()[..]);
        }
        out
    }
}

fn build_dir(dir: &DirEntry, part: &mut Part) -> Result<(Checksum, Checksum), String> {
    let mut files = Vec::new();
    for (name, file) in &dir.files {
        let mode = 0o100000 | (file.mode & 0o7777);
        let header = FileHeader {
            uid: 0,
            gid: 0,
            mode,
            symlink_target: String::new(),
            xattrs: Xattrs::empty(),
        };
        let mut hasher = ContentHasher::new(&header).map_err(|e| e.to_string())?;
        hasher.update(&file.data);
        let checksum = hasher.finish();
        part.add_file(&file.data, mode, checksum);
        files.push((name.clone(), checksum));
    }
    let mut dirs = Vec::new();
    for (name, child) in &dir.dirs {
        let (tree, meta) = build_dir(child, part)?;
        dirs.push((name.clone(), tree, meta));
    }
    let tree = DirTree { files, dirs };
    let tree_bytes = tree.serialize().map_err(|e| e.to_string())?;
    let tree_checksum = Checksum::sha256(&tree_bytes);
    part.add_meta(2, &tree_bytes, tree_checksum);
    let meta = DirMeta {
        uid: 0,
        gid: 0,
        mode: 0o040755,
        xattrs: Xattrs::empty(),
    };
    let meta_bytes = meta.serialize().map_err(|e| e.to_string())?;
    let meta_checksum = Checksum::sha256(&meta_bytes);
    part.add_meta(3, &meta_bytes, meta_checksum);
    Ok((tree_checksum, meta_checksum))
}

fn modified_base64(checksum: &Checksum) -> String {
    base64::engine::general_purpose::STANDARD
        .encode(checksum.as_bytes())
        .replace('/', "_").trim_end_matches('=').to_string()
}

pub fn build(tar: &[u8], ref_name: &str, timestamp: u64) -> Result<Vec<u8>, String> {
    let root = read_tree(tar)?;
    let metadata = root
        .files
        .get("metadata")
        .ok_or("the app tree has no metadata file")?
        .data
        .clone();
    let metadata_string = String::from_utf8(metadata.clone()).map_err(|e| e.to_string())?;

    let mut part = Part::default();
    let (root_tree, root_meta) = build_dir(&root, &mut part)?;

    let commit_metadata_value = commit_metadata(
        [(
            "xa.metadata".to_string(),
            Value::variant(Type::Str, Value::Str(metadata_string.clone())),
        )],
        Some(&[ref_name]),
        None,
    );
    let commit = Commit {
        metadata: commit_metadata_value,
        parent: None,
        related: Vec::new(),
        subject: String::new(),
        body: String::new(),
        timestamp,
        root_dirtree: root_tree,
        root_dirmeta: root_meta,
    };
    let commit_bytes = commit.serialize().map_err(|e| e.to_string())?;
    let commit_checksum = Checksum::sha256(&commit_bytes);

    let part_payload = encode_to_vec(&PartPayload {
        modes: &part.modes,
        data: &part.raw,
        operations: &part.operations,
    })
    .map_err(|e| e.to_string())?;
    let part_value = Value::Tuple(vec![Value::Byte(0), Value::Bytes(part_payload)]);
    let part_bytes = to_bytes(&Type::parse("(yay)").map_err(|e| e.to_string())?, &part_value)
        .map_err(|e| e.to_string())?;
    let part_checksum = Checksum::sha256(&part_bytes);
    let part_path = format!(
        "deltas/{}/{}/0",
        &modified_base64(&commit_checksum)[..2],
        &modified_base64(&commit_checksum)[2..]
    );

    let metadata_entries = vec![
        Value::Tuple(vec![
            Value::Str("flatpak".into()),
            Value::variant(
                Type::parse("u").map_err(|e| e.to_string())?,
                Value::U32(0xe5890001),
            ),
        ]),
        Value::Tuple(vec![
            Value::Str("ref".into()),
            Value::variant(Type::Str, Value::Str(ref_name.into())),
        ]),
        Value::Tuple(vec![
            Value::Str("metadata".into()),
            Value::variant(Type::Str, Value::Str(metadata_string)),
        ]),
        Value::Tuple(vec![
            Value::Str("collection-id".into()),
            Value::variant(Type::Str, Value::Str(String::new())),
        ]),
        Value::Tuple(vec![
            Value::Str("ostree.endianness".into()),
            Value::variant(
                Type::parse("y").map_err(|e| e.to_string())?,
                Value::Byte(b'l'),
            ),
        ]),
        Value::Tuple(vec![
            Value::Str(part_path),
            Value::variant(
                Type::parse("(yay)").map_err(|e| e.to_string())?,
                part_value,
            ),
        ]),
    ];
    let object_list = part.object_list();
    let part_meta = Value::Tuple(vec![
        Value::U32(0),
        Value::Bytes(part_checksum.as_bytes().to_vec()),
        Value::U64(part_bytes.len() as u64),
        Value::U64(part.uncompressed),
        Value::Bytes(object_list),
    ]);

    let superblock_type = Type::parse(
        "(a{sv}tayay(a{sv}aya(say)sstayay)aya(uayttay)a(yaytt))",
    )
    .map_err(|e| e.to_string())?;
    let commit_value = from_bytes(
        &Type::parse("(a{sv}aya(say)sstayay)").map_err(|e| e.to_string())?,
        &commit_bytes,
    )
    .map_err(|e| e.to_string())?;
    let superblock = Value::Tuple(vec![
        Value::Array(metadata_entries),
        Value::U64(0),
        Value::Bytes(Vec::new()),
        Value::Bytes(commit_checksum.as_bytes().to_vec()),
        commit_value,
        Value::Bytes(Vec::new()),
        Value::Array(vec![part_meta]),
        Value::Array(Vec::new()),
    ]);
    to_bytes(&superblock_type, &superblock).map_err(|e| e.to_string())
}

#[wasm_bindgen]
pub fn build_flatpak(tar: &[u8], ref_name: &str, timestamp: u32) -> Result<Vec<u8>, JsValue> {
    build(tar, ref_name, u64::from(timestamp)).map_err(|e| JsValue::from_str(&e))
}
