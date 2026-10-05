package com.marca.agenda;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WhatsAppLauncher")
public class WhatsAppLauncherPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String phone = call.getString("phone");
        String message = call.getString("message");
        if (phone == null || !phone.matches("[0-9]{12,15}") || message == null || message.length() > 1000) {
            call.reject("Não foi possível preparar a mensagem.");
            return;
        }

        Uri uri = Uri.parse("https://wa.me/" + phone).buildUpon()
            .appendQueryParameter("text", message)
            .build();
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("Não encontramos o WhatsApp ou um navegador neste aparelho.");
        }
    }
}
