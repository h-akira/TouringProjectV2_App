# TouringProjectV2_App

TouringProjectV2 の Android アプリ（Expo SDK 58・Development Build・expo-router）。
インカムのボタンで質問を始め、回答を背面で待って読み上げ、ナビのアプリへ戻る。
プロジェクト全体の要件・方針・契約は [docs-parent/](docs-parent/README.md)（親リポジトリの写し。編集しない）。

## 構成

| 場所 | 中身 |
|---|---|
| `app/` | 画面（ホーム・設定・接続・ユーザー名・応答後に戻るアプリ・回答の音量・録音の確認） |
| `src/ask/` | 一巡の状態機械（`flow.ts`）・司令塔（`controller.ts`）・本物の部品（`runtime.ts`）・ポーリング・会話・試し録り（`trial.ts`）・残した録音（`recordings.ts`・`recordingFiles.ts`） |
| `src/location/` | 位置の監視（`tracker.ts`）と方位の材料の選び方（`heading.ts`） |
| `src/api/` | Backend の API（`Backend/openapi.yaml`） |
| `modules/handsfree/` | インカムのボタンの合図（`VOICE_COMMAND`）を Activity のライフサイクルから受ける |
| `modules/audio-route/` | インカムのマイクへの経路（音声認識として・仮想通話として）・2回目の押下の検出・メディアの音量・録音中の入力デバイス |
| `modules/ride-service/` | フォアグラウンドサービス・ネイティブで待つ `sleep`・ナビを開く・合図の音 |
| `plugins/withHandsfree.js` | Manifest に `VOICE_COMMAND` の受け口を足す |

## 大事な決まり

- 背面で待つ処理に `setTimeout` を使わない（React Native が背面で止める）。`RideService.sleep` を使う。
- 一巡のあいだはフォアグラウンドサービスを動かす（無いと、画面を消したあと通信と再生が止まる）。
- 音声は `playsInSilentMode` を指定して鳴らす（指定しないと、マナーモードで再生が黙って無視される）。
- `setAudioModeAsync` は、内部で `setSpeakerphoneOn()` を呼び、このアプリの出力先を本体のスピーカーに固定してしまう（回答がインカムに届かない）。呼んだ直後に `AudioRoute.releaseSco()` で出力先の指定を消す（`src/ask/runtime.ts`）。呼ぶところを増やすときも同じにする。
- インカムは音の出だしを落とす。合図は長さを指定できる音（`TONE_SUP_DIAL`・`TONE_DTMF_*`）で長めに鳴らし、開始の合図は録音が始まってから鳴らす。`TONE_PROP_*` は、長さを指定しても約0.16秒で止まる。

## テスト

```sh
npm ci && npx jest && npx tsc --noEmit
```

## 実機で動かす

`.env`（追跡しない）に API の URL を書く。

```sh
URL=$(AWS_PROFILE=touring aws cloudformation describe-stacks --region ap-northeast-1 --stack-name stack-trv2-dev-backend \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
printf 'EXPO_PUBLIC_API_BASE_URL=%s\n' "$URL" > .env
npx expo prebuild --platform android --clean
npx expo run:android --device
```

接続キーは、アプリの「設定 → 接続の設定」で入れる（Backend の README の手順で読む）。キーをどこにも表示せずに入れるときは、入力欄を開いた状態で `adb shell input text "$KEY"` で打ち込む。

一度入れたあとは、JS の変更だけなら Metro につなぎ直せばよい（Development Build は USB 越しに Mac の Metro から JS を読む。USB を外すと動かない）。

```sh
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client --localhost
adb shell am start -a android.intent.action.VIEW \
  -d "exp+touring-v2://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.touringproject.v2
```

一巡の状態・合図・経路の結果は、`console.log` の JSON として Metro のログに出る。

## 走行用のビルド

開発用のビルドは、JS を USB 越しに Mac の Metro から読むので、USB を外すと動かない。走行で使うときは、JS を組み込んだ release のビルドを入れる。

```sh
npx expo prebuild --platform android --clean
npx expo run:android --variant release --device
```

- 署名は開発用と同じ鍵（`debug.keystore`）なので、開発用のビルドの上に入り、接続キー・設定・残した録音はそのまま残る。開発用に戻すときは `npx expo run:android --device` をもう一度実行する。
- API の URL（`.env`）は、ビルドのときに JS に組み込まれる。URL を変えたら作り直す。
- ログは Metro ではなく `adb logcat -s ReactNativeJS trv2.route trv2.ride` で見る。
- 開発用にだけ入る権限（`ACCESS_LOCAL_NETWORK`）が入っていないことを確かめる。`SYSTEM_ALERT_WINDOW`・`READ/WRITE_EXTERNAL_STORAGE`・`VIBRATE` は Expo の雛形が本体にも入れるもので、App は使わない（`SYSTEM_ALERT_WINDOW` は、利用者が「他のアプリの上に重ねて表示」を許可しない限り効果が無い）。

```sh
"$ANDROID_HOME"/build-tools/$(ls "$ANDROID_HOME"/build-tools | sort -V | tail -1)/aapt2 dump permissions \
  android/app/build/outputs/apk/release/app-release.apk
```
