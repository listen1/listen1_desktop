const jsmediatags = require("jsmediatags");
const path = require("path");
module.exports = {
  // code from https://github.com/margox/Meaga
  readAudioTags(filePath) {
    return new Promise((resolve, reject) => {
      new jsmediatags.Reader(filePath)
        .setTagsToRead(["title", "artist", "album", "picture"])
        .read({
          onSuccess: (tag) => {
            if (tag.tags.title === undefined) {
              tag.tags.title = path.basename(filePath, path.extname(filePath));
            }
            if (tag.tags.album === undefined) {
              tag.tags.album = "";
            }
            if (tag.tags.artist === undefined) {
              tag.tags.artist = "";
            }
            resolve(tag);
          },
          onError: (error) => {
            resolve({
              tags: {
                title: path.basename(filePath),
                album: "",
                artist: "",
              },
            });
          },
        });
    });
  },
};
