#[test]
fn writes_a_flatpak_superblock() {
    let mut tar = tar::Builder::new(Vec::new());
    let metadata = b"[Application]\nname=com.example.Test\nruntime=org.gnome.Platform/x86_64/50\ncommand=shell\n";
    let mut header = tar::Header::new_ustar();
    header.set_size(metadata.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    tar.append_data(&mut header, "metadata", &metadata[..]).unwrap();
    let mut file_header = tar::Header::new_ustar();
    file_header.set_size(6);
    file_header.set_mode(0o755);
    file_header.set_cksum();
    tar.append_data(&mut file_header, "files/bin/shell", &b"hello\n"[..]).unwrap();
    let tar = tar.into_inner().unwrap();
    let bytes = url2app_flatpak_bundle::build(
        &tar,
        "app/com.example.Test/x86_64/master",
        0,
    )
    .unwrap();
    assert!(bytes.starts_with(b"flatpak\0"));
}
