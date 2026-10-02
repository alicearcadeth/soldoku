package com.sudoku.game

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

internal object ExternalLinks {
    fun browserIntent(context: Context, uri: Uri): Intent? {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        val browsers = context.packageManager
            .queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_BROWSER), PackageManager.MATCH_DEFAULT_ONLY)
            .map { it.activityInfo.packageName }
            .filter { it != context.packageName && it != "com.solana.mwallet" }
        val browser = browsers.firstOrNull() ?: return null
        return Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            setPackage(browser)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}
