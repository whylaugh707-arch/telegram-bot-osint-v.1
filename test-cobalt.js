import axios from "axios";
async function test() {
  try {
      const res = await axios.post("https://api.cobalt.tools/api/json", {
        url: "https://www.youtube.com/watch?v=kYtGl1dX5qI",
        isAudioOnly: true,
        aFormat: "mp3"
      }, {
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });
      console.log("COBALT", res.data);
  } catch(e) { console.log("COBALT ERROR", e.message, e.response?.data); }
}
test();
