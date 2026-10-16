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
