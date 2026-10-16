const withHandsfree = require("../../../plugins/withHandsfree");

test("adds the VOICE_COMMAND intent filter once", () => {
  const manifest = {
    manifest: {
      application: [{ activity: [{ $: { "android:name": ".MainActivity" }, "intent-filter": [] }] }],
    },
  };
  const once = withHandsfree.addVoiceCommandFilter(manifest);
  const twice = withHandsfree.addVoiceCommandFilter(once);
  const filters = twice.manifest.application[0].activity[0]["intent-filter"];
  expect(filters).toHaveLength(1);
  expect(filters[0].action[0].$["android:name"]).toBe("android.intent.action.VOICE_COMMAND");
  expect(filters[0].category[0].$["android:name"]).toBe("android.intent.category.DEFAULT");
});
