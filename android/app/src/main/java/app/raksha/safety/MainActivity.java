package app.raksha.safety;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DirectCallPlugin.class);
        super.onCreate(savedInstanceState);
        askForSafetyPermissionsOnce();
    }

    /**
     * Ask for everything an emergency needs the first time the app opens, so nobody has to answer
     * permission prompts while in danger. Asked once; later changes are made in Android settings.
     */
    private void askForSafetyPermissionsOnce() {
        SharedPreferences prefs = getSharedPreferences("raksha", MODE_PRIVATE);
        if (prefs.getBoolean("permissions_asked", false)) return;
        prefs.edit().putBoolean("permissions_asked", true).apply();

        List<String> missing = new ArrayList<>();
        List<String> wanted = new ArrayList<>();
        wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
        wanted.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        wanted.add(Manifest.permission.CALL_PHONE);
        wanted.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33) wanted.add(Manifest.permission.POST_NOTIFICATIONS);
        for (String p : wanted) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), 7001);
    }
}
