use std::process::ExitCode;

fn main() -> ExitCode {
    match url2app_installer_helper::run_with(std::env::args().skip(1)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("URL to App installer: {error}");
            ExitCode::FAILURE
        }
    }
}
