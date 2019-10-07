/* --------------------
 * stream-chop module
 * Tests
 * ------------------*/

/* eslint-disable jest/expect-expect */

'use strict';

// Modules
const ChopStream = require('../index');

// Imports
const {createReadStream, createWriteStream} = require('./streams.js');

// Init
require('./support');

// Tests

describe('streams whole input', () => {
	async function streamTest(size) {
		const chopStream = makeStream(size);
		await streamChunk(chopStream, 0, size);
	}

	it('with 1KB', async () => {
		await streamTest(1024);
	});

	it('with 1MB', async () => {
		await streamTest(1024 * 1024);
	});

	it('with 10MB', async () => {
		await streamTest(10 * 1024 * 1024);
	});
});

describe('streams in chunks', () => {
	describe('2 chunks', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart);
			await streamChunk(chopStream, sizePart, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});

	describe('4 chunks', () => {
		async function streamTest(size) {
			const sizePart = size / 4;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart);
			await streamChunk(chopStream, sizePart, sizePart);
			await streamChunk(chopStream, sizePart * 2, sizePart);
			await streamChunk(chopStream, sizePart * 3, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});
});

describe('streams in chunks with parts divisions off 4-bytes boundaries', () => {
	describe('2 chunks', () => {
		async function streamTest(size) {
			const sizePart1 = size / 2 + 2,
				sizePart2 = size - sizePart1;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart1);
			await streamChunk(chopStream, sizePart1, sizePart2);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});

	describe('4 chunks', () => {
		async function streamTest(size) {
			const sizePart = size / 4,
				sizePart1 = sizePart + 2,
				sizePart2 = sizePart,
				sizePart3 = sizePart - 7,
				sizePart4 = size - sizePart1 - sizePart2 - sizePart3;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart1);
			await streamChunk(chopStream, sizePart1, sizePart2);
			await streamChunk(chopStream, sizePart1 + sizePart2, sizePart3);
			await streamChunk(chopStream, sizePart1 + sizePart2 + sizePart3, sizePart4);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});
});

describe('allows rewind', () => {
	describe('to start', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart);
			await streamChunk(chopStream, 0, sizePart);
			await streamChunk(chopStream, sizePart, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});

	describe('to part-way through', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);

			await streamChunk(chopStream, 0, sizePart);
			await streamChunk(chopStream, sizePart * 0.5, sizePart * 1.5);
			await streamChunk(chopStream, sizePart, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});
});

describe('allows rewind when first output stream failed', () => {
	describe('to start', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);
			await consumePartOfChunkAndDestroy(chopStream, 0, sizePart, 100);
			await streamChunk(chopStream, 0, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});

	describe('to where left off', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);
			const resumePos = await consumePartOfChunkAndDestroy(chopStream, 0, sizePart, 100);
			await streamChunk(chopStream, resumePos, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});

	describe('to part-way through data already received', () => {
		async function streamTest(size) {
			const sizePart = size / 2;

			const chopStream = makeStream(size);
			const bytesReceived = await consumePartOfChunkAndDestroy(chopStream, 0, sizePart, 100);
			const resumePos = Math.floor(bytesReceived / 2);
			await streamChunk(chopStream, resumePos, sizePart);
		}

		it('with 1KB', async () => {
			await streamTest(1024);
		});

		it('with 1MB', async () => {
			await streamTest(1024 * 1024);
		});

		it('with 10MB', async () => {
			await streamTest(10 * 1024 * 1024);
		});
	});
});

/*
 * Utilities
 */
function makeStream(size) {
	const chopStream = new ChopStream();
	const inputStream = createReadStream(0, size);
	inputStream.pipe(chopStream);
	return chopStream;
}

function streamChunk(chopStream, start, len) {
	const chunkStream = chopStream.chunk(start, len);
	const outputStream = createWriteStream(start, len);
	chunkStream.pipe(outputStream);
	return outputStream.promise;
}

function consumePartOfChunkAndDestroy(chopStream, start, len, destroyLen) {
	return new Promise((resolve, reject) => {
		const chunkStream = chopStream.chunk(start, len);
		chunkStream.on('error', reject);
		chunkStream.on('end', () => reject(new Error('Chunk stream ended unexpectedly')));

		let bytesReceived = 0;
		chunkStream.on('data', (chunk) => {
			bytesReceived += chunk.length;

			if (bytesReceived > destroyLen) {
				chunkStream.destroy();
				resolve(bytesReceived);
			}
		});
	});
}
