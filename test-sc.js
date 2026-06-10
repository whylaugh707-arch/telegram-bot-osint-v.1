import play from "play-dl";
async function test() {
  try {
     const res = await play.search("lastchild pedih", { source: { soundcloud: "tracks" } , limit: 1});
     if(res.length > 0) {
         console.log("SC FOUND:", res[0].url, res[0].name);
         const stream = await play.stream(res[0].url);
         console.log("SC STREAM:", stream.type);
     } else {
         console.log("Not found in SC");
     }
  } catch(e) { console.log(e.message); }
}
test();
