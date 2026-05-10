use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton},
    Manager, Emitter,
};

static MAIN_WINDOW_VISIBLE: AtomicBool = AtomicBool::new(true);

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
        .title("Floating")
        .inner_size(190.0, 48.0)
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
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    MAIN_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
    let _ = update_tray_menu_state(&app);
    Ok(())
}

#[tauri::command]
async fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    MAIN_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
    let _ = update_tray_menu_state(&app);
    Ok(())
}

#[tauri::command]
async fn set_window_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(&title).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_main_window_always_on_top(app: tauri::AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(always_on_top).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    for window in app.webview_windows() {
        let _ = window.1.hide();
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn update_tray_menu(app: tauri::AppHandle, toggle_text: String, quit_text: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("tauri") {
        let toggle_i = MenuItem::with_id(&app, "toggle_main", toggle_text, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let quit_i = MenuItem::with_id(&app, "quit", quit_text, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let menu = Menu::with_items(&app, &[&toggle_i, &quit_i])
            .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn update_tray_menu_state(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("tauri") {
        let is_visible = MAIN_WINDOW_VISIBLE.load(Ordering::SeqCst);
        let toggle_text = if is_visible { "Hide Main" } else { "Show Main" };
        let toggle_i = MenuItem::with_id(app, "toggle_main", toggle_text, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let menu = Menu::with_items(app, &[&toggle_i, &quit_i])
            .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn is_main_window_visible() -> Result<bool, String> {
    Ok(MAIN_WINDOW_VISIBLE.load(Ordering::SeqCst))
}

#[tauri::command]
async fn emit_custom_texts_updated(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("custom-texts-updated", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn force_reload(app: tauri::AppHandle) -> Result<(), String> {
    for window in app.webview_windows() {
        let _ = window.1.eval("window.location.reload()");
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            MAIN_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
            let _ = update_tray_menu_state(app);
        }))
        .setup(|app| {
            let toggle_i = MenuItem::with_id(app, "toggle_main", "Toggle Main", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                let app_handle_clone = app_handle.clone();
                let _ = window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            MAIN_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
                            let _ = update_tray_menu_state(&app_handle_clone);
                            let _ = app_handle_clone.emit("window-state-changed", ());
                        }
                        tauri::WindowEvent::Focused(payload) => {
                            if !payload {
                                let _ = update_tray_menu_state(&app_handle_clone);
                            }
                        }
                        _ => {}
                    }
                });
            }

            let icon = app.default_window_icon().unwrap().clone();
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle_main" => {
                        let is_visible = MAIN_WINDOW_VISIBLE.load(Ordering::SeqCst);
                        if let Some(window) = app.get_webview_window("main") {
                            if is_visible {
                                let _ = window.hide();
                                MAIN_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                                MAIN_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let is_visible = MAIN_WINDOW_VISIBLE.load(Ordering::SeqCst);
                        if let Some(window) = app.get_webview_window("main") {
                            if is_visible {
                                let _ = window.hide();
                                MAIN_WINDOW_VISIBLE.store(false, Ordering::SeqCst);
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                                MAIN_WINDOW_VISIBLE.store(true, Ordering::SeqCst);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_floating_window,
            hide_floating_window,
            show_main_window,
            hide_main_window,
            set_window_title,
            set_main_window_always_on_top,
            quit_app,
            update_tray_menu,
            is_main_window_visible,
            get_exe_dir,
            get_db_path,
            emit_custom_texts_updated,
            force_reload,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
