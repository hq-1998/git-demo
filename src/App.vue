<script setup>
import { computed, reactive } from "vue";
import request from "./utils/request";

// * 1024
const SIZE = 10 * 1024;

const dataSource = reactive({
  container: {
    file: null,
    worker: null,
    hash: null,
  },
  hashPercentage: 0,
  data: [],
});

const uploadPercentage = computed(() => {
  if (!dataSource.container.file || !dataSource.data.length) return 0;
  const loaded = dataSource.data
    .map((item) => item.size * item.percentage)
    .reduce((acc, cur) => acc + cur);
  return parseInt((loaded / dataSource.container.file.size).toFixed(2));
});

// 生成文件切片
const createFileChunk = (file, size = SIZE) => {
  const fileChunkList = [];
  let cur = 0;
  while (cur < file.size) {
    fileChunkList.push({
      file: file.slice(cur, cur + size),
    });
    cur += size;
  }
  return fileChunkList;
};

const mergeRequest = async () => {
  await request({
    url: "http://127.0.0.1:8086/merge",
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    data: JSON.stringify({
      size: SIZE,
      filename: dataSource.container.file.name,
    }),
  });
};

const createProgressHandler = (item) => {
  return (e) => {
    item.percentage = parseInt(String(e.loaded / e.total) * 100);
  };
};

const uploadChunks = async () => {
  const requestList = dataSource.data
    .map(({ chunk, hash, index }) => {
      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("hash", hash);
      formData.append("filename", dataSource.container.file.name);
      return { formData, index };
    })
    .map(({ formData, index }) => {
      return request({
        url: "http://127.0.0.1:8086",
        method: "POST",
        data: formData,
        onProgress: createProgressHandler(dataSource.data[index]),
      });
    });

  await Promise.all(requestList);
  await mergeRequest();
};

const handleFileChange = (e) => {
  const [file] = e.target.files;
  if (!file) return;
  dataSource.container.file = file;
};

const calculateHash = (fileChunkList) => {
  return new Promise((resolve) => {
    dataSource.container.worker = new Worker("/hash.js");
    dataSource.container, worker.postMessage({ fileChunkList });
    dataSource.worker.onmessage = (e) => {
      const { percentage, hash } = e.data;
      dataSource.hashPercentage = percentage;
      if (hash) {
        resolve(hash);
      }
    };
  });
};

const handleUpload = async () => {
  if (!dataSource.container.file) return;
  const fileChunkList = createFileChunk(dataSource.container.file);
  dataSource.container.hash = await calculateHash(fileChunkList);
  dataSource.data = fileChunkList.map(({ file }, index) => {
    return {
      chunk: file,
      index,
      hash: dataSource.container.file.name + "-" + index,
      percentage: 0,
      fileHash: dataSource.container.hash,
      size: SIZE,
    };
  });
  await uploadChunks();
};
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <hr />
    <el-button @click="handleUpload">upload</el-button>
    <hr />
    <el-table :data="dataSource.data" style="width: 100%">
      <el-table-column prop="hash" label="chunk hash" width="180" />
      <el-table-column prop="size" label="size(KB)" width="180" />
      <el-table-column prop="percentage" label="percentage" />
    </el-table>
  </div>
</template>
