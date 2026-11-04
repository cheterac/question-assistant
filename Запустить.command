#!/bin/bash
set -eu
cd "$(dirname "$0")"
root="$(pwd -P)"
profile="$HOME/Library/Application Support/Ответ рядом/Browser"
marker="--question-assistant-instance=mac-cloud-v1"
mkdir -p "$profile"
if [[ ! -f "$root/cloud/manifest.json" ]]; then
  echo "Распакуйте комплект целиком. Рядом нужна папка cloud."; exit 1
fi
if [[ -f "$profile/launcher.pid" ]]; then
  read -r pid < "$profile/launcher.pid"
  if [[ "$pid" =~ ^[0-9]+$ ]] && [[ "$(ps -p "$pid" -o command=)" == *"$marker"* ]]; then
    echo "Отдельный браузер уже запущен."; exit 0
  fi
fi
browser=""
for name in Chromium "Google Chrome" "Microsoft Edge"; do
  for base in /Applications "$HOME/Applications"; do
    candidate="$base/$name.app/Contents/MacOS/$name"
    if [[ -x "$candidate" ]]; then browser="$candidate"; break 2; fi
  done
done
if [[ -z "$browser" ]]; then
  echo "Нужен Chromium, Google Chrome или Microsoft Edge для Mac."; exit 1
fi
echo "Если расширения нет в списке: включите режим разработчика → Загрузить распакованное."
echo "Выберите папку: $root/cloud"
echo "Откройте параметры расширения и введите ключ Groq. Вызов на странице: Option + Shift + Q."
nohup "$browser" "$marker" "--user-data-dir=$profile" "--load-extension=$root/cloud" --no-first-run --no-default-browser-check chrome://extensions/ >"$profile/browser.log" 2>&1 </dev/null &
pid=$!
echo "$pid" > "$profile/launcher.pid"
sleep 1
if ! kill -0 "$pid" 2>/dev/null; then
  echo "Браузер не запустился. Журнал: $profile/browser.log"; exit 1
fi
