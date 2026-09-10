#!/bin/sh
set -eu

chatlog_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$chatlog_script_dir/run-browser-tests.py"
