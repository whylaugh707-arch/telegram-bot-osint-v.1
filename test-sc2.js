import scdl from "soundcloud-downloader";
async function test() {
  try {
     const client = scdl.default || scdl;
     const res = await client.search({ query: "last child diary depresiku", resourceType: "tracks", limit: 1 });
     if(res.collection && res.collection.length > 0) {
         console.log("SC FOUND:", res.collection[0].permalink_url, res.collection[0].title);
         const stream = await client.download(res.collection[0].permalink_url);
         console.log("SC STREAM OK");
     } else {
         console.log("Not found in SC");
     }
  } catch(e) { console.log("SC ERROR", e.message); }
}
test();
