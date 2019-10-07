/* --------------------
 * stream-chop module
 * ------------------*/

'use strict';

// Modules
const {Writable, Readable} = require('readable-stream');

// Exports
class ChopStream extends Writable {
	/**
	 * Constructor.
	 * Takes usual WritableStream options.
	 * @param {Object} [options] - Options object
	 */
	constructor(options) {
		options = {...options, decodeStrings: true};
		super(options);

		// Public properties
		this.bufferStart = 0;
		this.bufferLength = 0;

		// Private properties
		this._position = 0;
		this._buffers = [];
		this._writeCb = null;
		this._resetOutputStream();
	}

	/**
	 * Writeable stream implementation.
	 * @private
	 * @param {Buffer} chunk - Incoming chunk
	 * @param {string} encoding - Chunk encoding (ignored)
	 * @param {function} cb - Callback function for when chunk written
	 */
	_write(chunk, encoding, cb) { // NB `encoding` is ignored because `decodeStrings` option is used
		// Error if previous write not complete yet
		if (this._writeCb != null) {
			cb(new Error('._write() called before last write complete'));
			return;
		}

		// Ignore empty chunks
		let chunkLength = chunk.length;
		if (chunkLength === 0) {
			cb(null);
			return;
		}

		// Set position
		let chunkStart = this._position;
		const chunkEnd = chunkStart + chunkLength;
		this._position = chunkEnd;

		// If chunk is before buffer start, discard
		const {bufferStart} = this;
		if (chunkEnd < bufferStart) {
			cb(null);
			return;
		}

		// If chunk is partly before buffer start, split and discard unwanted section
		if (chunkStart < bufferStart) {
			const splitAt = bufferStart - chunkStart;
			chunk = chunk.slice(splitAt);
			chunkStart += splitAt;
			chunkLength -= splitAt;
		}

		// Add chunk to buffer
		const outEnd = this._outEnd;
		if (outEnd != null && chunkEnd > outEnd) {
			// Chunk goes beyond end of chunk required in output stream.
			// Split into 2 chunks and push both to buffer.
			const splitAt = outEnd - chunkStart;
			let chunkNext;
			[chunk, chunkNext] = bufferSplit(chunk, splitAt);
			this._buffers.push(chunk, chunkNext);
		} else {
			this._buffers.push(chunk);
		}

		this.bufferLength += chunkLength;

		// If cannot write immediately to output stream, save callback for later
		if (!this._outFlowing) {
			this._writeCb = cb;
			return;
		}

		// Write chunk to output stream
		this._pushChunk(chunk);

		// Callback to indicate ready for more
		cb(null);
	}

	/**
	 * Reset output stream.
	 * @private
	 * @returns {undefined}
	 */
	_resetOutputStream() {
		this._outStream = null;
		this._outPos = null;
		this._outEnd = null;
		this._outFlowing = false;
		this._outReadBytes = 0;
	}

	/**
	 * Get a readable stream for specified chunk of input stream.
	 * @param {number} start - Bytes position to start chunk
	 * @param {number} length - Length of chunk in bytes
	 * @returns {Stream} - Chunk stream
	 */
	chunk(start, length) {
		// Validate input
		if (!Number.isInteger(start)) throw new Error('start must be an integer');
		if (!Number.isInteger(length)) throw new Error('length must be an integer');

		// Clear buffer before start point
		this._clearBuffer(start);

		const {bufferStart} = this;
		if (bufferStart < start) {
			this.bufferStart = start;
		} else if (start < bufferStart) {
			// Trying to read from position which is not in future and not buffered
			throw new Error(`Cannot read chunk starting at byte ${start} - it has already passed and is not buffered`);
		}

		// End existing stream
		if (this._outStream) {
			this._outStream.destroy();
			this._resetOutputStream();
		}

		// Create new output stream
		this._outPos = start;
		this._outEnd = start + length;
		this._outFlowing = false;
		this._outReadBytes = 0;
		const outStream = new Readable({
			read: bytes => this._readChunk(outStream, bytes)
		});
		this._outStream = outStream;

		return outStream;
	}

	/**
	 * Called when `._read()` called on chunk stream.
	 * @private
	 * @param {Stream} readStream - Stream `._read()` was called on
	 * @param {number} bytes - Number of bytes to read
	 * @returns {undefined}
	 */
	_readChunk(readStream, bytes) {
		if (readStream !== this._outStream) {
			throw new Error('`._read()` called on output stream which has already ended');
		}

		// TODO Is this required? Currently how many bytes is requested is ignored
		this._outReadBytes += bytes;

		// If no content in buffer to push, flag stream as flowing so future writes
		// are pushed to output stream and exit
		const {bufferEnd, _outPos: outPos} = this;
		if (bufferEnd <= outPos) {
			this._outFlowing = true;
			return;
		}

		// Error if gap between what's requested and what's in buffer
		let chunkStart = this.bufferStart;
		if (chunkStart > outPos) {
			throw new Error(`Buffer starts at ${chunkStart} but need from ${outPos}`);
		}

		// Locate first chunk from buffer to push
		// TODO This loop can be avoided by caching `index` between calls to `._readChunk()`
		const {_outEnd: outEnd, _buffers: buffers} = this;
		let index = 0,
			chunk,
			chunkEnd;
		while (true) { // eslint-disable-line no-constant-condition
			// Get next chunk from buffer
			chunk = buffers[index];
			chunkEnd = chunkStart + chunk.length;

			// Stop searching if found first chunk
			if (chunkStart === outPos) break;

			// Skip chunk if before what's wanted
			if (chunkEnd <= outPos) {
				chunkStart = chunkEnd;
				index++;
				// NB No need to check if index is out of bounds as already checked above
				// that buffer does contain data that's wanted
				continue;
			}

			// Only part of chunk wanted - split off only what's required
			chunk = chunk.slice(outPos - chunkStart);
			chunkStart = outPos;
		}

		// Push chunks
		while (true) { // eslint-disable-line no-constant-condition
			// If only part of chunk required, split it
			if (chunkEnd > outEnd) {
				chunkEnd = outEnd;
				chunk = chunk.slice(0, outEnd - chunkStart);
			}

			// Push chunk
			const flowing = this._pushChunk(chunk);
			if (!flowing) break;

			// Get next chunk from buffer
			index++;
			if (index === buffers.length) break;

			chunkStart = chunkEnd;
			chunk = buffers[index];
			chunkEnd = chunkStart + chunk.length;
		}

		// Call `._write()`'s callback if have streamed out all received
		const cb = this._writeCb;
		if (cb && chunkEnd === this._position) {
			this._writeCb = null;
			cb(null);
		}
	}

	/**
	 * Push chunk to output stream.
	 * @param {Buffer} chunk - Buffer to push
	 * @returns {boolean} - `true` if ready to receive more
	 */
	_pushChunk(chunk) {
		// TODO Only push amount requested by `._read()`
		const chunkLength = chunk.length,
			outStream = this._outStream;
		let flowing = outStream.push(chunk);
		this._outFlowing = flowing;
		this._outPos += chunkLength;
		this._outReadBytes -= chunkLength;

		// If reached end of requested chunk, end output stream
		if (this._outPos === this._outEnd) {
			outStream.push(null);
			this._resetOutputStream();
			flowing = false;
		}

		return flowing;
	}

	/**
	 * Clear buffer up to specified byte position.
	 * @param {number} [end] - Byte position to clear before
	 * @returns {undefined}
	 */
	clearBuffer(end) {
		// Validate input
		if (end != null && !Number.isInteger(end)) throw new Error('end must be an integer if provided');

		this._clearBuffer(end);
	}

	/**
	 * Clear buffer up to specified byte position.
	 * Only called internally, so does not validate input.
	 * @private
	 * @param {number} [end] - Byte position to clear before
	 * @returns {undefined}
	 */
	_clearBuffer(end) {
		// If no `end` provided or whole buffer is before `end`, clear all buffer
		const {bufferStart, bufferEnd} = this;
		if (end == null || bufferEnd <= end) {
			this._buffers.length = 0;
			this.bufferStart = this._position;
			this.bufferLength = 0;
			return;
		}

		// Exit if no data buffered before this point
		if (bufferStart >= end) return;

		// Locate position in buffer to cut from
		const buffers = this._buffers;
		let numToDiscard = 0,
			pos = bufferStart;
		for (const buffer of buffers) {
			pos += buffer.length;
			if (pos > end) {
				// Split buffer
				buffers[numToDiscard] = buffer.slice(buffer.length + end - pos);
				break;
			}

			numToDiscard++;

			if (pos === end) break;
		}

		if (numToDiscard > 0) buffers.splice(0, numToDiscard);
		this.bufferStart = end;
		this.bufferLength = bufferEnd - end;
	}

	/**
	 * Getter for `bufferEnd`
	 * @returns {number} - Byte position of end of buffer
	 */
	get bufferEnd() {
		return this.bufferStart + this.bufferLength;
	}
}

module.exports = ChopStream;

/*
 * Utility functions
 */

function bufferSplit(buffer, splitAt) {
	return [
		buffer.slice(0, splitAt),
		buffer.slice(splitAt)
	];
}
