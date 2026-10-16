// Lets the intercom's assistant button (VOICE_COMMAND) open the app. The press itself is read by the
// handsfree module from the activity lifecycle, so MainActivity does not need to be rewritten.
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const VOICE_COMMAND = "android.intent.action.VOICE_COMMAND";

function addVoiceCommandFilter(androidManifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
  activity["intent-filter"] = activity["intent-filter"] || [];
  const present = activity["intent-filter"].some((f) => (f.action || []).some((a) => a.$["android:name"] === VOICE_COMMAND));
  if (!present) {
    activity["intent-filter"].push({
      action: [{ $: { "android:name": VOICE_COMMAND } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
    });
  }
  return androidManifest;
}

const withHandsfree = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = addVoiceCommandFilter(c.modResults);
    return c;
  });

module.exports = withHandsfree;
module.exports.addVoiceCommandFilter = addVoiceCommandFilter;
