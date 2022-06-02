const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fse = require("fs-extra");
const multiparty = require("multiparty");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const UPLOAD_DIR = path.resolve(__dirname, "..", "target");

app.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.status = 200;
    res.end();
    return;
  }
  next();
});

app.post("/", async (req, res) => {
  const multipart = new multiparty.Form();

  multipart.parse(req, async (err, fields, files) => {
    if (err) {
      return;
    }

    const [chunk] = files.chunk; 
    const [hash] = fields.hash;
    const [filename] = fields.filename;
    
    const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir" + filename);
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir);
    }

    await fse.move(chunk.path, `${chunkDir}/${hash}`);
    res.send("received file chunk");
  });
});

const pipeStream = (path, writeStream) => {
  return new Promise((resolve) => {
    const readStream = fse.createReadStream(path);
    readStream.on("end", () => {
      fse.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });
};

const mergeFileChunk = async (filePath, filename, size) => {
  const chunkDir = path.resolve(UPLOAD_DIR, "chunkDir" + filename);
  const chunkPaths = await fse.readdir(chunkDir);

  chunkPaths.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
  await Promise.all(
    chunkPaths.map((chunkPath, index) => {
      pipeStream(
        path.resolve(chunkDir, chunkPath),
        fse.createWriteStream(filePath, {
          start: index * size,
        })
      );
    })
  );

  fse.rmdirSync(chunkDir);
};

app.post("/merge", async (req, res) => {
  const { filename, size } = req.body;
  const filePath = path.resolve(UPLOAD_DIR, `${filename}`);
  await mergeFileChunk(filePath, filename, size);
  res.end(
    JSON.stringify({
      code: 0,
      message: "file merged success",
    })
  );
});

app.listen(8086, "127.0.0.1", () => console.log("listening port 6666"));
