import appJson from "../../app.json";

test("android package and scheme are fixed", () => {
  expect(appJson.expo.android.package).toBe("com.touringproject.v2");
  expect(appJson.expo.scheme).toBe("trv2");
  expect(appJson.expo.name).toBe("Touring V2");
});

test("audio plays in the background", () => {
  const audio = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-audio") as [string, { enableBackgroundPlayback: boolean }];
  expect(audio[1].enableBackgroundPlayback).toBe(true);
});

test("native module sources are not ignored by git", () => {
  const { execFileSync } = require("child_process") as typeof import("child_process");
  const ignored = (path: string) => {
    try {
      execFileSync("git", ["check-ignore", "-q", path], { cwd: `${__dirname}/../..` });
      return true;
    } catch {
      return false;
    }
  };
  expect(ignored("modules/handsfree/android/build.gradle")).toBe(false);
  expect(ignored("modules/ride-service/android/src/main/AndroidManifest.xml")).toBe(false);
  expect(ignored("modules/handsfree/android/build/outputs/x")).toBe(true);
  expect(ignored("android/app/build.gradle")).toBe(true);
});
