# Keep the shell's public surface stable: the browser-side patcher relies on
# these class and resource names staying put.
-keep class com.urltoapk.shell.** { *; }
