/* --------------------
 * stream-chop
 * Functions to create test streams
 * ------------------*/

/* eslint-disable no-bitwise */

'use strict';

// Modules
const {GeneratorReadStream, GeneratorWriteStream} = require('stream-gen'),
	{Random} = require('@offirmo/random');

// Constants
const SEED = 0;

// Exports

module.exports = {
	createReadStream,
	createWriteStream
};

/**
 * Create readable byte stream of specified length.
 * Stream of bytes is drawn from MT pseudo-random generator.
 * Output for same `start` and `len` is deterministic.
 *
 * @param {number} start - Start bytes of sequence
 * @param {number} len - Length of sequence
 * @returns {Stream} - Readable data stream
 */
function createReadStream(start, len) {
	const gen = createGenerator(start, len);
	return new GeneratorReadStream(gen);
}

/**
 * Create writable stream.
 * It checks that data piped into it matches expected
 * i.e. same data as in stream from `createReadStream()`.
 * Return value is a stream with a `.promise` property.
 * The promise resolves if stream matches expected, or rejects if not.
 *
 * @param {number} start - Start bytes of sequence
 * @param {number} len - Length of sequence
 * @param {function} cb - Callback - called with `null` when stream ends, or an error if matching fail
 * @returns {Stream} - Readable data stream
 */
function createWriteStream(start, len) {
	const gen = createGenerator(start, len);

	let stream;
	const promise = new Promise((resolve, reject) => {
		stream = new GeneratorWriteStream(gen, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
	stream.promise = promise;

	return stream;
}

function createGenerator(start, len) {
	// Init MT pseudo-random number generator
	const mt = Random.engines.mt19937();
	mt.seed(SEED);

	// Init empty buffer
	let leftover = 0,
		leftoverBytes = 0;

	// Discard start
	if (start > 0) {
		const discardBytes = start % 4,
			discardQuads = (start - discardBytes) / 4;
		if (discardQuads > 0) mt.discard(discardQuads);

		if (discardBytes > 0) {
			// Get new 32-bit number, discard unneeded bytes, and put rest in leftover
			leftover = mt();
			leftover >>= discardBytes * 8;
			leftoverBytes = 4 - discardBytes;
		}
	}

	// Create generator to produce bytes
	let bytesRemaining = len;
	function next() {
		// If finished, end generator
		if (bytesRemaining === 0) return {value: undefined, done: true};

		// If no leftover, pull another 32-bit number from MT.
		if (leftoverBytes === 0) {
			leftover = mt();
			leftoverBytes = 4;
		}

		// Pull lowest byte from leftover
		const value = leftover & 0xFF;
		leftover >>= 8;
		leftoverBytes--;
		bytesRemaining--;

		return {value, done: false};
	}

	return () => ({next});
}
