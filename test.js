import fetch from "node-fetch";
import scdl from "soundcloud-downloader";
import fs from "fs";

async function testApi() {
  try {
    const res = await scdl.default.search({
      query: "serana for revenge",
      resourceType: "tracks",
      limit: 1
    });
    console.log("SC Search:", res.collection[0].permalink_url);
    const stream = await scdl.default.download(res.collection[0].permalink_url);
    stream.pipe(fs.createWriteStream("audio.mp3"));
    console.log("SC Streaming started!");
  } catch(e) {
    console.log("SC Download error:", e.message);
  }
}

testApi();
