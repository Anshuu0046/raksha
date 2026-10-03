package app.raksha.safety;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Places a phone call straight away (no dialer screen) once the user has granted the CALL_PHONE
 * permission. If she declines, it falls back to opening the dialer with the number filled in.
 * Only ever called from an explicit tap on a Call button.
 */
@CapacitorPlugin(
    name = "DirectCall",
    permissions = { @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "call") }
)
public class DirectCallPlugin extends Plugin {

    @PluginMethod
    public void call(PluginCall call) {
        String number = call.getString("number");
        if (number == null || !number.matches("^\\+?[0-9]{3,15}$")) {
            call.reject("Invalid phone number");
            return;
        }
        if (getPermissionState("call") == PermissionState.GRANTED) {
            place(call, number, true);
        } else {
            requestPermissionForAlias("call", call, "callPermissionResult");
        }
    }

    @PermissionCallback
    private void callPermissionResult(PluginCall call) {
        String number = call.getString("number");
        place(call, number, getPermissionState("call") == PermissionState.GRANTED);
    }

    private void place(PluginCall call, String number, boolean direct) {
        Intent intent = new Intent(direct ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + number));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        JSObject result = new JSObject();
        result.put("direct", direct);
        call.resolve(result);
    }
}
