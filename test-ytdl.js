import youtubedl from 'youtube-dl-exec';
try {
  const output = await youtubedl('https://www.youtube.com/watch?v=kYtGl1dX5qI', {
    dumpSingleJson: true,
    noWarnings: true,
  });
  console.log("SUCCESS:", output.title, output.url);
} catch (e) {
  console.error("ERROR:", e.message);
}
