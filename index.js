const axios = require('axios')
const crypto = require('crypto-js')
const sha1 = require('crypto-js/sha1')
const path = require('path')
const fs = require('fs')

const graphql = async (queryString, variables = {}) => {
  const headers = {
    'key': process.argv[2],
    'altitoken': process.argv[3]
  }
  const options = {
    url: 'https://api.altizure.com/graphql',
    method: 'POST',
    headers,
    data: {
      query: queryString,
      variables
    }
  }
  return axios(options)
}
const sha1sum = (fileBinary) => {
  const wordArray = crypto.lib.WordArray.create(fileBinary)
  return sha1(wordArray).toString()
}
const createProject = async (name) => {
  name = name || 'new_project_' + Date()
  const res = await graphql(`
  mutation {
    createProject(name: "${name}") {
      id
      name
    }
  }
  `)
  return res.data.data.createProject.id
}
const getBucket = async () => {
  const res = await graphql(`
  {
    getGeoIPInfo {
      id
      nearestBuckets {
        bucket
        display
        cloud
      }
    }
  }
`)
  return res.data.data.getGeoIPInfo.nearestBuckets[0].bucket
}
const uploadImageS3 = async ({
  pid, filename, bucket, checksum, type = 'JPEG'
}) => {
  const res = await graphql(`
  mutation {
    uploadImageS3(pid: "${pid}", filename: "${filename}", bucket: ${bucket}, checksum: "${checksum}",  type: ${type}) {
      url
      image {
        id
        state
      }
    }
  }
`)
  return res.data.data.uploadImageS3
}
const startImageUpload = async (id) => {
  const res = await graphql(`mutation { startImageUpload(id: "${id}") { id state } }`)
  return res.data.data.startImageUpload
}
const put = async ({ url, file, htmltype = 'image/jpeg'}) => {
  return axios.put(url, file, {
    headers: {
      'Content-Type': htmltype
    }
  })
}
const main = async () => {
  try {
    const folder = process.argv[4]
    if (!folder) {
      console.log('usage: node index.js <key> <altitoken> </path/to/my/image/folder>')
      process.exit(-1)
    }
    const files = fs.readdirSync(folder)
    const bucket = await getBucket()
    const pid = process.argv[5] || (await createProject())
    files.forEach(async f => {
      try {
        console.log('start to upload', f)
        const filebuffer = fs.readFileSync(path.resolve(folder, f))
        const checksum = sha1sum(filebuffer)
        const { url, image } = await uploadImageS3({pid, filename: f, bucket, checksum})
        const { state } = await startImageUpload(image.id)
        const res = await put({ url, file: filebuffer })
        if (res.status === 200)  {
          console.log('upload done', f)
        } else {
          console.error('upload fail', f)
        }
      } catch (e) {
        console.error(e.message)
      }
    })
  } catch (e) {
    console.error(e.message)
  }
}
main()