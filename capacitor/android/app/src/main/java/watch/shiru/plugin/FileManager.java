package watch.shiru.plugin;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FileManager")
public class FileManager extends Plugin {

  private ActivityResultLauncher<Intent> folderPickerLauncher;
  private PluginCall savedCall;

  @Override
  public void load() {
    folderPickerLauncher = getActivity().registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(),
        this::handleFolderPickerResult
    );
  }

  @PluginMethod
  public void requestAllFilesAccess(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      if (!Environment.isExternalStorageManager()) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getActivity().getPackageName()));
        getActivity().startActivity(intent);
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void hasAllFilesAccess(PluginCall call) {
    JSObject result = new JSObject();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      result.put("granted", Environment.isExternalStorageManager());
    } else {
      result.put("granted", true);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void pickFolder(PluginCall call) {
    call.setKeepAlive(true);
    savedCall = call;
    folderPickerLauncher.launch(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE));
  }

  private void handleFolderPickerResult(ActivityResult result) {
    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
      Uri uri = result.getData().getData();
      DocumentFile documentFile = DocumentFile.fromTreeUri(getContext(), uri);
      if (documentFile != null && documentFile.isDirectory()) {
        JSObject obj = new JSObject();
        obj.put("path", uri.toString());
        savedCall.resolve(obj);
      } else {
        savedCall.reject("Selected path is not a valid directory");
      }
    } else {
      savedCall.reject("Folder selection was cancelled or an error occurred");
    }
  }
}