[![NPM version](https://img.shields.io/npm/v/stream-chop.svg)](https://www.npmjs.com/package/stream-chop)
[![Build Status](https://img.shields.io/travis/overlookmotel/stream-chop/master.svg)](http://travis-ci.org/overlookmotel/stream-chop)
[![Dependency Status](https://img.shields.io/david/overlookmotel/stream-chop.svg)](https://david-dm.org/overlookmotel/stream-chop)
[![Dev dependency Status](https://img.shields.io/david/dev/overlookmotel/stream-chop.svg)](https://david-dm.org/overlookmotel/stream-chop)
[![Greenkeeper badge](https://badges.greenkeeper.io/overlookmotel/stream-chop.svg)](https://greenkeeper.io/)
[![Coverage Status](https://img.shields.io/coveralls/overlookmotel/stream-chop/master.svg)](https://coveralls.io/r/overlookmotel/stream-chop)

# Chop a single stream of data into a series of readable streams with rewind

## What's it for

The use case is:

* You are transfering data from a stream to a service/process which needs it in chunks
* Each chunk can be streamed
* If a chunk fails to transfer, you need to be able to "rewind" to send it again

An example is upload to Google Drive with the "resumable" method for large files (the use case that this package was created for).

## Usage

### Installation

```
npm install stream-chop
```

### Usage

```js
const ChopStream = require('stream-chop');

const inputStream = fs.createReadStream('file.mov');
const chopStream = new ChopStream();

inputStream.pipe(chopStream);

// Stream 1st 1024 bytes of data to file
const subStream1 = chopStream.chunk(0, 1024);
const outStream1 = fs.createWriteStream('part1.mov');
subStream1.pipe(outStream1);

outStream1.on('finish', () => {
  console.log('Done!');
});
```

### Methods

#### `.chunk( start, length )

Get a stream for specified chunk of the input stream.

```js
// Get stream for 1st 256 KiB of input stream
const subStream1 = chopStream.chunk(0, 256 * 1024);
```

The chunk is buffered internally, so `.chunk()` can be called again with same `start` if transferring the chunk fails and it needs to be sent again.

When `.chunk()` is called again, any data buffered before the start point is discarded. i.e. You cannot stream 2 chunks concurrently. It must be one at a time.

Calling `.chunk()` will cause any existing unfinished chunk stream to emit an `error` event and stop streaming.

#### `.clearBuffer( [end] )`

Clear data from internal buffer before byte `end`.

If `end` is undefined, then entire buffer will be cleared.

```js
// Discard any data in buffer
chopStream.clearBuffer();

// Discard first 128 KiB of stream data if it's buffered
chopStream.clearBuffer(1024 * 128);
```

`.chunk(1000)` automatically calls `.clearBuffer(1000)` internally.

Once data has been discarded from the buffer, the stream can no longer be "rewound" to stream that data out again.

### Properties

#### `.bufferStart`

Returns byte position of start of buffer.

#### `.bufferEnd`

Returns byte position of end of buffer.

#### `.bufferLength`

Returns number of bytes in buffer.

## Tests

Use `npm test` to run the tests. Use `npm run cover` to check coverage.

## Changelog

See [changelog.md](https://github.com/overlookmotel/stream-chop/blob/master/changelog.md)

## Issues

If you discover a bug, please raise an issue on Github. https://github.com/overlookmotel/stream-chop/issues

## Contribution

Pull requests are very welcome. Please:

* ensure all tests pass before submitting PR
* add tests for new features
* document new functionality/API additions in README
* do not add an entry to Changelog (Changelog is created when cutting releases)
