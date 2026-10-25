use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

pub fn set(app_id: &str) {
    let wide: Vec<u16> = OsStr::new(app_id)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let _ =
            windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}
