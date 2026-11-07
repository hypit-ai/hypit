# `@hypit/host-paths`

Filesystem locations shared by Node hosts.

This package only maps a selected project or operating-system user environment to conventional
state directories. It does not open files, select a Runtime, discover projects, own stored state or
define a central registry. Applications may override the resulting paths at their own boundary.
