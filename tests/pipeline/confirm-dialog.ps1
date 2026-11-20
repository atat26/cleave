# Used by the test driver (run.mjs) after it asks the app to delete one of ITS OWN test items for good.
# The app asks first in a native dialog ("Delete for good"), so this answers it, but only when the
# dialog names one of the titles it was given. Any other dialog is left exactly as it is.
#
#   powershell -File confirm-dialog.ps1 -Titles "Test Packing|Weekend Trip" -WaitSeconds 4
param(
  [Parameter(Mandatory = $true)][string]$Titles,
  [int]$WaitSeconds = 4
)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class DlgTool {
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  public static List<IntPtr> Find(string title) {
    var r = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h)) { var t = new StringBuilder(256); GetWindowText(h, t, 256); if (t.ToString() == title) r.Add(h); }
      return true;
    }, IntPtr.Zero);
    return r;
  }
  public static string Text(IntPtr dlg) {
    var sb = new StringBuilder();
    EnumChildWindows(dlg, (h, l) => {
      var c = new StringBuilder(64); GetClassName(h, c, 64);
      if (c.ToString() == "Static") { var t = new StringBuilder(512); GetWindowText(h, t, 512); sb.Append(t).Append(' '); }
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
  }
  public static bool Click(IntPtr dlg, string text) {
    bool done = false;
    EnumChildWindows(dlg, (h, l) => {
      var c = new StringBuilder(64); GetClassName(h, c, 64);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if (c.ToString() == "Button" && t.ToString() == text) { SendMessage(h, 0x00F5, IntPtr.Zero, IntPtr.Zero); done = true; return false; }
      return true;
    }, IntPtr.Zero);
    return done;
  }
}
"@
# The dialog's words, as the screen reader sees them (the dialog is a native task dialog).
function Get-DialogText($handle) {
  $el = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
  ($el.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond) | ForEach-Object { $_.Current.Name }) -join ' '
}
$allowed = $Titles.Split('|') | Where-Object { $_ -ne '' }
$clicked = 0
$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  foreach ($h in [DlgTool]::Find('Delete for good')) {
    $text = Get-DialogText $h
    $match = $allowed | Where-Object { $text.Contains($_) }
    if ($match) {
      if ([DlgTool]::Click($h, 'Delete for good')) { $clicked++ }
    }
  }
  if ($clicked -gt 0) { break }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)
Write-Output $clicked
