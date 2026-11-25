fn main() {
    // The same common-controls manifest must be present in the application and
    // in test binaries. `tauri-build` only embeds resources into binaries, so
    // disable its manifest and attach ours to every linkable target instead.
    // Without common controls v6 the loader resolves comctl32 v5, which lacks
    // `TaskDialogIndirect` (imported by tao), and test binaries abort with
    // STATUS_ENTRYPOINT_NOT_FOUND. On non-Windows targets this is a no-op.
    embed_resource::compile_for_everything("test-manifest.rc", embed_resource::NONE)
        .manifest_required()
        .expect("failed to compile the application manifest");

    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
