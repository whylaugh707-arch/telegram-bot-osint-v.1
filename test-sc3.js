import scdl from "soundcloud-downloader";
async function test() {
  try {
     const client = scdl.default || scdl;
     const res = await client.search({ query: "last child diary depresiku", resourceType: "tracks", limit: 1 });
     const track = res.collection[0];
     console.log("Title:", track.title);
     console.log("Author:", track.user.username);
     console.log("Artwork:", track.artwork_url);
  } catch(e) { console.log(e); }
}
test();
