use std::env;
use std::fs;
fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: write <app-layer.tar> <ref> <timestamp> <out.flatpak>");
        std::process::exit(2);
    }
    let tar = fs::read(&args[1]).unwrap();
    let bytes = url2app_flatpak_bundle::build(&tar, &args[2], args[3].parse().unwrap()).unwrap();
    fs::write(&args[4], bytes).unwrap();
}
