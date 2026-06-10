import axios from "axios";
async function test() {
  const instances = [
    "https://api.cobalt.best",
    "https://cobalt.api.zluo.de",
    "https://cobalt.q0.o0o.ooo",
    "https://co.wuk.sh",
    "https://api.cobalt.tools"
  ];
  for (const api of instances) {
     try {
         const res = await axios.post(`${api}${api.endsWith('cobalt.tools') ? '/api/json': '/api/json'}`, {
            url: "https://www.youtube.com/watch?v=kYtGl1dX5qI",
            isAudioOnly: true,
            aFormat: "mp3"
         }, {
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "Origin": api.replace("api.", ""),
              "User-Agent": "Mozilla/5.0"
            }
         });
         console.log(api, "=>", res.data);
     } catch(e) { console.log(api, "=> fail", e.message, e.response?.data); }
  }
}
test();
