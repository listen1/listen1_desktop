const { existsSync } = require("fs");
const { readFile } = require("fs/promises");
const { parseFile } = require("music-metadata");
const { basename, extname, parse, format } = require("path");
module.exports = {
  async readAudioTags(filePath) {
    const fileName = basename(filePath, extname(filePath));
    try {
      const metaData = await parseFile(filePath);
      metaData.common.title ||= fileName;
      const lyric_url = format({
        ...parse(filePath),
        ext: ".lrc",
        base: undefined,
      });
      //if metadata doesn't include lyric, then try to read from local lyric file
      if (!metaData.common.lyrics && existsSync(lyric_url)) {
        metaData.common.lyrics = [];
        metaData.common.lyrics[0] = (await readFile(lyric_url)).toString();
      }
      return metaData;
    } catch (error) {
      console.warn(error);
      return {
        common: {
          title: fileName,
          album: "",
          artist: "",
        },
      };
    }
  },
};
