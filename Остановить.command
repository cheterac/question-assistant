#!/bin/bash
set -eu
profile="$HOME/Library/Application Support/Ответ рядом/Browser"
file="$profile/launcher.pid"
marker="--question-assistant-instance=mac-cloud-v1"
if [[ ! -s "$file" ]]; then echo "Запущенного экземпляра нет."; exit 0; fi
read -r pid < "$file"
if [[ ! "$pid" =~ ^[0-9]+$ ]]; then echo "Некорректный номер процесса."; exit 1; fi
commandline="$(ps -p "$pid" -o command= || true)"
if [[ "$commandline" == *"$marker"* && "$commandline" == *"--user-data-dir=$profile"* ]]; then
  kill -TERM "$pid"
  for ((i=0; i<100; i++)); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then echo "Браузер ещё завершает работу."; exit 1; fi
fi
rm -f "$file"
echo "Отдельный экземпляр закрыт."
