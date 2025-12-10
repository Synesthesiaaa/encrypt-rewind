$BOT_TOKEN = "ODg3NTY2OTQ2NjQyNTc5NDk4.G8QRox.KobUl6k874Bk89pcOuaYLW5CvnMGAAgMSkrehs"          # ← from .env
$CLIENT_ID = "887566946642579498"          # ← from Discord Dev Portal
$GUILD_ID  = "914905357879504896"           # ← your test server ID

$commands = '[{"name":"ping","description":"Test","type":1}]'
$commands = '[{"name":"lolstats","description":"Test","type":2}]'

$uri = "https://discord.com/api/v10/applications/$CLIENT_ID/guilds/$GUILD_ID/commands"

Write-Host "📡 POST $uri" -ForegroundColor Cyan
Write-Host "📦 Body: $commands"

try {
    $req = [System.Net.HttpWebRequest]::Create($uri)
    $req.Method = "PUT"
    $req.ContentType = "application/json"
    $req.Headers.Add("Authorization", "Bot $BOT_TOKEN")

    # Send body
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($commands)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()

    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Host "✅ $body" -ForegroundColor Green
} catch {
    $err = $_.Exception
    $resp = $err.Response
    if ($resp) {
        Write-Host "❌ Status: $($resp.StatusCode) $($resp.StatusDescription)" -ForegroundColor Red
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "📄 Response: $body" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Network error: $err" -ForegroundColor Red
    }
}