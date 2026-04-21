use tauri::Manager;
use std::fs;

#[tauri::command]
fn get_exe_dir() -> String {
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    exe_dir.to_string_lossy().to_string()
}

#[tauri::command]
fn get_db_path() -> String {
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let db_path = exe_dir.join("config.db");
    db_path.to_string_lossy().to_string()
}

#[tauri::command]
async fn show_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        window.show().map_err(|e| e.to_string())?;
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "floating",
            tauri::WebviewUrl::App("floating.html".into())
        )
        .title("悬浮窗")
        .inner_size(200.0, 200.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("floating") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            show_floating_window,
            hide_floating_window,
            show_main_window,
            hide_main_window,
            get_exe_dir,
            get_db_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}