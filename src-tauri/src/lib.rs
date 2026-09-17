// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod remote;

use remote::RemoteShared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(RemoteShared::new())
        .invoke_handler(tauri::generate_handler![
            remote::remote_get_status,
            remote::remote_start,
            remote::remote_stop,
            remote::remote_set_port,
            remote::remote_regen_pin,
            remote::remote_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
