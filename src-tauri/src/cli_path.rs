use std::path::PathBuf;

/// Get the directory containing the running executable.
#[cfg(target_os = "windows")]
fn exe_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "Failed to get executable directory".to_string())
}

#[cfg(target_os = "windows")]
pub fn install_cli() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let dir = exe_dir()?;
    let dir_str = dir.to_string_lossy().to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (env, _) = hkcu
        .create_subkey("Environment")
        .map_err(|e| format!("Failed to open registry: {}", e))?;

    let current: String = env.get_value("Path").unwrap_or_default();

    // Check if already present (case-insensitive on Windows)
    if current
        .split(';')
        .any(|p| p.eq_ignore_ascii_case(&dir_str))
    {
        return Ok("CLI command is already installed.".to_string());
    }

    let new_path = if current.is_empty() {
        dir_str.clone()
    } else {
        format!("{};{}", current.trim_end_matches(';'), dir_str)
    };

    env.set_value("Path", &new_path)
        .map_err(|e| format!("Failed to update PATH: {}", e))?;

    // Broadcast WM_SETTINGCHANGE so Explorer picks up the change
    unsafe {
        let env_wide: Vec<u16> = "Environment\0".encode_utf16().collect();
        windows_sys::Win32::UI::WindowsAndMessaging::SendMessageTimeoutW(
            windows_sys::Win32::UI::WindowsAndMessaging::HWND_BROADCAST,
            windows_sys::Win32::UI::WindowsAndMessaging::WM_SETTINGCHANGE,
            0,
            env_wide.as_ptr() as isize,
            windows_sys::Win32::UI::WindowsAndMessaging::SMTO_ABORTIFHUNG,
            5000,
            std::ptr::null_mut(),
        );
    }

    Ok(format!(
        "Added to PATH. Restart your terminal to use the 'emdee' command."
    ))
}

#[cfg(target_os = "macos")]
pub fn install_cli() -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let symlink = PathBuf::from("/usr/local/bin/emdee");

    // Check if already installed and pointing to the right place
    if symlink.exists() {
        if let Ok(target) = std::fs::read_link(&symlink) {
            if target == exe {
                return Ok("CLI command is already installed.".to_string());
            }
        }
    }

    // Try direct symlink first (works if /usr/local/bin is user-writable)
    let _ = std::fs::remove_file(&symlink);
    if std::os::unix::fs::symlink(&exe, &symlink).is_ok() {
        return Ok("Installed 'emdee' command to /usr/local/bin.".to_string());
    }

    // Need elevated permissions — use osascript to prompt for admin
    let script = format!(
        "do shell script \"mkdir -p /usr/local/bin && ln -sf '{}' '{}'\" with administrator privileges",
        exe.display(),
        symlink.display()
    );
    let status = std::process::Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| format!("Failed to request permissions: {}", e))?;

    if status.success() {
        Ok("Installed 'emdee' command to /usr/local/bin.".to_string())
    } else {
        Err("Permission denied. Could not create CLI symlink.".to_string())
    }
}

#[cfg(target_os = "linux")]
pub fn install_cli() -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let bin_dir = dirs::home_dir()
        .ok_or("Could not determine home directory")?
        .join(".local/bin");

    std::fs::create_dir_all(&bin_dir)
        .map_err(|e| format!("Failed to create {}: {}", bin_dir.display(), e))?;

    let symlink = bin_dir.join("emdee");

    // Check if already installed and pointing to the right place
    if symlink.symlink_metadata().is_ok() {
        if let Ok(target) = std::fs::read_link(&symlink) {
            if target == exe {
                return Ok("CLI command is already installed.".to_string());
            }
        }
        std::fs::remove_file(&symlink)
            .map_err(|e| format!("Failed to remove existing symlink: {}", e))?;
    }

    std::os::unix::fs::symlink(&exe, &symlink)
        .map_err(|e| format!("Failed to create symlink: {}", e))?;

    // Check if ~/.local/bin is in PATH
    let path_var = std::env::var("PATH").unwrap_or_default();
    let in_path = path_var
        .split(':')
        .any(|p| p == bin_dir.to_string_lossy().as_ref());

    if in_path {
        Ok(format!(
            "Installed 'emdee' command to {}.",
            symlink.display()
        ))
    } else {
        Ok(format!(
            "Installed 'emdee' command to {}.\n\nNote: {} is not in your PATH. Add it with:\n  export PATH=\"{}:$PATH\"",
            symlink.display(),
            bin_dir.display(),
            bin_dir.display()
        ))
    }
}
