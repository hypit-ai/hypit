param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("read", "write", "remove")]
  [string]$Operation
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class HypitCredentialManager
{
    private const uint Generic = 1;
    private const uint LocalMachine = 2;
    private const int NotFound = 1168;
    private const int MaxBlobBytes = 2560;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential
    {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool CredWriteW(ref Credential credential, uint flags);

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool CredDeleteW(string target, uint type, uint flags);

    [DllImport("advapi32.dll", ExactSpelling = true)]
    private static extern void CredFree(IntPtr buffer);

    public static string Read(string target)
    {
        IntPtr buffer;
        if (!CredReadW(target, Generic, 0, out buffer))
        {
            int error = Marshal.GetLastWin32Error();
            if (error == NotFound) return null;
            throw new Win32Exception(error);
        }
        try
        {
            Credential credential = (Credential)Marshal.PtrToStructure(buffer, typeof(Credential));
            if (credential.CredentialBlobSize == 0 || credential.CredentialBlobSize > MaxBlobBytes)
                throw new InvalidOperationException("Invalid credential blob size.");
            byte[] bytes = new byte[credential.CredentialBlobSize];
            Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
            return Convert.ToBase64String(bytes);
        }
        finally { CredFree(buffer); }
    }

    public static void Write(string target, string secret)
    {
        byte[] bytes = Convert.FromBase64String(secret);
        if (bytes.Length == 0 || bytes.Length > MaxBlobBytes)
            throw new InvalidOperationException("Invalid credential blob size.");
        GCHandle pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try
        {
            Credential credential = new Credential {
                Type = Generic, TargetName = target, Persist = LocalMachine,
                CredentialBlobSize = (uint)bytes.Length, CredentialBlob = pinned.AddrOfPinnedObject()
            };
            if (!CredWriteW(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        finally { pinned.Free(); }
    }

    public static void Remove(string target)
    {
        if (!CredDeleteW(target, Generic, 0))
        {
            int error = Marshal.GetLastWin32Error();
            if (error != NotFound) throw new Win32Exception(error);
        }
    }
}
'@

switch ($Operation) {
  "read" { [HypitCredentialManager]::Read([string]$request.target) }
  "write" { [HypitCredentialManager]::Write([string]$request.target, [string]$request.secret) }
  "remove" { [HypitCredentialManager]::Remove([string]$request.target) }
}
