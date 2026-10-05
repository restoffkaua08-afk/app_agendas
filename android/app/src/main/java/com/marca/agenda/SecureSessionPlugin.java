package com.marca.agenda;

import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "com.marca.agenda.session";
    private static final String PREFS = "secure_session";
    private static final String IV = "iv";
    private static final String VALUE = "value";

    @PluginMethod
    public void set(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 8192) {
            call.reject("Sessão inválida.");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
            prefs.edit()
                .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível proteger a conexão neste aparelho.");
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        String encodedIv = prefs.getString(IV, null);
        String encodedValue = prefs.getString(VALUE, null);
        JSObject result = new JSObject();
        if (encodedIv == null || encodedValue == null) {
            result.put("value", (String) null);
            call.resolve(result);
            return;
        }
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            Key key = keyStore.getKey(KEY_ALIAS, null);
            if (key == null) throw new IllegalStateException("Session key is missing");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
            String value = new String(cipher.doFinal(Base64.decode(encodedValue, Base64.NO_WRAP)), StandardCharsets.UTF_8);
            result.put("value", value);
            call.resolve(result);
        } catch (Exception error) {
            removeStoredSession();
            call.reject("A conexão salva não pôde ser recuperada. Conecte novamente.");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        removeStoredSession();
        call.resolve();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    private void removeStoredSession() {
        getContext().getSharedPreferences(PREFS, 0).edit().clear().apply();
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // The encrypted session is already removed; a missing key is harmless.
        }
    }
}
