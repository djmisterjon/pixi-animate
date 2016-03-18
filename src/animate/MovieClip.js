/**
 * @module PixiAnimate
 * @namespace PIXI.animate
 */
(function(PIXI, undefined)
{
	var Container = PIXI.Container;
	var DisplayObject = PIXI.DisplayObject;
	var Timeline = PIXI.animate.Timeline;
	var Tween = PIXI.animate.Tween;
	var SharedTicker = PIXI.ticker.shared;

	/**
	 * Provide timeline playback of movieclip
	 * @class MovieClip
	 * @extends PIXI.Container
	 * @constructor
	 * @param {Object|int} [options] The options object or the mode to play
	 * @param {int} [options.mode=0] The playback mode default is independent (0),
	 * @param {int} [options.startPosition=0] The starting frame
	 * @param {Boolean} [options.loop=true] If playback is looped
	 * @param {Object} [options.labels] The frame labels map of label to frames
	 * @param {int} [options.duration] The duration, if no duration is provided, auto determines length
	 * @param {int} [options.framerate=24] The framerate to use for independent mode
	 */
	var MovieClip = function(options, duration, loop, framerate, labels)
	{
		Container.call(this);

		// Default options
		options = options ||
		{};

		// Options can also be the mode
		if (typeof options == "number")
		{
			options = {
				mode: options,
				duration: duration || 0,
				loop: loop === undefined ? true : loop,
				labels: labels ||
				{},
				framerate: framerate || 0
			};
		}

		// Apply defaults to options
		options = Object.assign(
		{
			mode: MovieClip.INDEPENDENT,
			startPosition: 0,
			loop: true,
			labels:
			{},
			duration: 0,
			framerate: 0
		}, options);

		/**
		 * Controls how this MovieClip advances its time. Must be one of 0 (INDEPENDENT), 1 (SINGLE_FRAME), or 2 (SYNCHED).
		 * See each constant for a description of the behaviour.
		 * @property mode
		 * @type int
		 * @default null
		 **/
		this.mode = options.mode;

		/**
		 * Specifies what the first frame to play in this movieclip, or the only frame to display if mode is SINGLE_FRAME.
		 * @property startPosition
		 * @type Number
		 * @default 0
		 */
		this.startPosition = options.startPosition;

		/**
		 * Indicates whether this MovieClip should loop when it reaches the end of its timeline.
		 * @property loop
		 * @type Boolean
		 * @default true
		 */
		this.loop = !!options.loop;

		/**
		 * The current frame of the movieclip.
		 * @property currentFrame
		 * @type Number
		 * @default 0
		 * @readOnly
		 */
		this.currentFrame = 0;

		this._labels = [];
		this._labelDict = options.labels;
		if (options.labels)
		{
			for (var name in options.labels)
			{
				var label = {
					label: name,
					position: options.labels[name]
				};
				this._labels.push(label);
			}
			this._labels.sort(function(a, b)
			{
				return a.position - b.position;
			});
		}

		/**
		 * If true, this movieclip will animate automatically whenever it is on the stage.
		 * @property selfAdvance
		 * @type Boolean
		 * @default true
		 */
		this.selfAdvance = true;

		/**
		 * If true, the MovieClip's position will not advance when ticked.
		 * @property paused
		 * @type Boolean
		 * @default false
		 */
		this.paused = false;

		/**
		 * If true, actions in this MovieClip's tweens will be run when the playhead advances.
		 * @property actionsEnabled
		 * @type Boolean
		 * @default true
		 */
		this.actionsEnabled = true;

		/**
		 * If true, the MovieClip will automatically be reset to its first frame whenever the timeline adds
		 * it back onto the display list. This only applies to MovieClip instances with mode=INDEPENDENT.
		 * <br><br>
		 * For example, if you had a character animation with a "body" child MovieClip instance
		 * with different costumes on each frame, you could set body.autoReset = false, so that
		 * you can manually change the frame it is on, without worrying that it will be reset
		 * automatically.
		 * @property autoReset
		 * @type Boolean
		 * @default true
		 */
		this.autoReset = true;

		/**
		 * @property _synchOffset
		 * @type Number
		 * @default 0
		 * @private
		 */
		this._synchOffset = 0;

		/**
		 * @property _prevPos
		 * @type Number
		 * @default -1
		 * @private
		 */
		this._prevPos = -1; // TODO: evaluate using a ._reset Boolean prop instead of -1.

		/**
		 * Note - changed from default: When the MovieClip is framerate independent, this is the time
		 * elapsed from frame 0 in seconds.
		 * @property _t
		 * @type Number
		 * @default 0
		 * @private
		 */
		this._t = 0;

		/**
		 * By default MovieClip instances advance one frame per tick. Specifying a framerate for the MovieClip
		 * will cause it to advance based on elapsed time between ticks as appropriate to maintain the target
		 * framerate.
		 *
		 * @property _framerate
		 * @type {Number}
		 * @default 0
		 **/
		this._framerate = options.framerate;

		/**
		 * The total time in seconds for the animation. This is changed when setting the framerate.
		 * @property _duration
		 * @type Number
		 * @default 0
		 * @private
		 */
		this._duration = 0;

		/**
		 * The total duration in frames for the animation.
		 * @property _totalFrames
		 * @type Number
		 * @default 0
		 * @private
		 */
		this._totalFrames = options.duration;

		/**
		 * Standard tween timelines for all objects. Each element in the _timelines array
		 * is a Timeline object - an array of tweens for one target, in order of occurrence.
		 * @property _timelines
		 * @type Array
		 * @protected
		 **/
		this._timelines = [];

		/**
		 * Array of child timelines denoting if a child is actively a child of this movieclip
		 * on any given frame. Each element in the _timedChildTimelines is an array with a 'target'
		 * property, and is an array of boolean values indexed by frame.
		 * @property _timedChildTimelines
		 * @type {Array}
		 * @protected
		 */
		this._timedChildTimelines = [];

		/**
		 * Array of frame scripts, indexed by frame.
		 * @property _actions
		 * @type {Array}
		 * @protected
		 */
		this._actions = [];

		if (this.mode == MovieClip.INDEPENDENT)
		{
			this._tickListener = this._tickListener.bind(this);
			this._onAdded = this._onAdded.bind(this);
			this._onRemoved = this._onRemoved.bind(this);
			this.on("added", this._onAdded);
			this.on("removed", this._onRemoved);
		}

		if (options.framerate)
		{
			this.framerate = options.framerate;
		}
	};

	/**
	 * The MovieClip will advance independently of its parent, even if its parent is paused.
	 * This is the default mode.
	 * @property INDEPENDENT
	 * @static
	 * @type String
	 * @default 0
	 * @readonly
	 **/
	MovieClip.INDEPENDENT = 0;

	/**
	 * The MovieClip will only display a single frame (as determined by the startPosition property).
	 * @property SINGLE_FRAME
	 * @static
	 * @type String
	 * @default 1
	 * @readonly
	 **/
	MovieClip.SINGLE_FRAME = 1;

	/**
	 * The MovieClip will be advanced only when its parent advances and will be synched to the position of
	 * the parent MovieClip.
	 * @property SYNCHED
	 * @static
	 * @type String
	 * @default 2
	 * @readonly
	 **/
	MovieClip.SYNCHED = 2;

	var p = MovieClip.prototype = Object.create(Container.prototype);

	p._onAdded = function()
	{
		SharedTicker.add(this._tickListener);
	};

	p._tickListener = function(tickerDeltaTime)
	{
		if (this.paused || !this.selfAdvance)
		{
			//see if the movieclip needs to be updated even though it isn't animating
			if (this._prevPos < 0)
				this._goto(this.currentFrame);
			return;
		}
		var seconds = tickerDeltaTime / SharedTicker.speed / PIXI.TARGET_FPMS / 1000;
		this.advance(seconds);
	};

	p._onRemoved = function()
	{
		SharedTicker.remove(this._tickListener);
	};

	/**
	 * Returns a sorted list of the labels defined on this AdvancedMovieClip.
	 * @method getLabels
	 * @return {Array[Object]} A sorted array of objects with label and position (aka frame)
	 *                        properties.
	 */
	p.getLabels = function()
	{
		return this._labels;
	};

	/**
	 * Returns the name of the label on or immediately before the current frame.
	 * @method getCurrentLabel
	 * @return {String} The name of the current label or null if there is no label.
	 */
	p.getCurrentLabel = function()
	{
		var labels = this._labels;
		var current = null;
		for (var i = 0, len = labels.length; i < len; ++i)
		{
			if (labels[i].position <= this.currentFrame)
				current = labels[i].label;
			else
				break;
		}
		return current;
	};

	/**
	 * Returns an array of objects with label and position (aka frame) properties, sorted by position.
	 * @property labels
	 * @type {Array}
	 * @readonly
	 **/

	/**
	 * Returns the name of the label on or immediately before the current frame.
	 * @property currentLabel
	 * @type {String}
	 * @readonly
	 **/
	try
	{
		Object.defineProperties(p,
		{
			labels:
			{
				get: p.getLabels
			},
			currentLabel:
			{
				get: p.getCurrentLabel
			}
		});
	}
	catch (e)
	{}

	Object.defineProperties(p,
	{
		/**
		 * When the MovieClip is framerate independent, this is the time elapsed from frame 0 in seconds.
		 * @property elapsedTime
		 * @type Number
		 * @default 0
		 * @public
		 */
		elapsedTime:
		{
			get: function()
			{
				return this._t;
			},
			set: function(value)
			{
				this._t = value;
			}
		},

		/**
		 * By default MovieClip instances advance one frame per tick. Specifying a framerate for the MovieClip
		 * will cause it to advance based on elapsed time between ticks as appropriate to maintain the target
		 * framerate.
		 *
		 * For example, if a MovieClip with a framerate of 10 is placed on a Stage being updated at 40fps, then the MovieClip will
		 * advance roughly one frame every 4 ticks. This will not be exact, because the time between each tick will
		 * vary slightly between frames.
		 *
		 * This feature is dependent on the tick event object (or an object with an appropriate "delta" property) being
		 * passed into {{#crossLink "Stage/update"}}{{/crossLink}}.
		 * @property framerate
		 * @type {Number}
		 * @default 0
		 **/
		framerate:
		{
			get: function()
			{
				return this._framerate;
			},
			set: function(value)
			{
				if (value > 0)
				{
					this._framerate = value;
					this._duration = value ? this._totalFrames / value : 0;
				}
				else
					this._framerate = this._duration = 0;
			}
		},

		/**
		 * Get the total number of frames (duration) of this MovieClip
		 * @property totalFrames
		 * @type {Number}
		 * @default 0
		 * @readOnly
		 **/
		totalFrames:
		{
			get: function()
			{
				return this._totalFrames;
			}
		}
	});

	/**
	 * Convenience method for setting multiple frames at once and adding the child
	 * @method addKeyframes
	 * @private
	 * @param {PIXI.DisplayObject} instance The clip to animate
	 * @param {Object} keyframes The collection of keyframe objects or data string, the key is frame number
	 */
	p.addKeyframes = function(instance, keyframes)
	{
		if (!keyframes) return;

		var i = 0;

		// Parse the value of the compressed keyframe
		var parseValue = function(frame, prop, buffer)
		{
			switch (prop)
			{
				case "c":
					{
						buffer = buffer.split(',');
						buffer.forEach(function(val, i, buffer)
						{
							buffer[i] = parseFloat(val);
						});
						frame.c = buffer;
						break;
					}
				case "t":
					{
						frame.t = buffer;
						break;
					}
				case "v":
					{
						frame.v = !!parseInt(buffer);
						break;
					}
				default:
					{
						frame[prop] = parseFloat(buffer);
						break;
					}
			}
		};

		// Convert serialized array into keyframes
		// "0x100y100,1x150" to: { "0": {"x":100, "y": 100}, "1": {"x": 150} }
		if (typeof keyframes == "string")
		{
			var result = {};
			var keysMap = {
				X: 'x', // x position
				Y: 'y', // y position
				A: 'sx', // scale x
				B: 'sy', // scale y
				C: 'kx', // skew x
				D: 'ky', // skew y
				R: 'r', // rotation
				L: 'a', // alpha
				T: 't', // tint
				F: 'c', // colorTransform
				V: 'v' // visibility
			};
			var c,
				buffer = "",
				isFrameStarted = false,
				prop,
				frame = {};

			while (i < keyframes.length)
			{
				c = keyframes[i];
				if (keysMap[c])
				{
					if (!isFrameStarted)
					{
						isFrameStarted = true;
						result[buffer] = frame;
					}
					if (prop)
					{
						parseValue(frame, prop, buffer);
					}
					prop = keysMap[c];
					buffer = "";
					i++;
				}
				// Start a new prop
				else if (c === " ")
				{
					i++;
					parseValue(frame, prop, buffer);
					buffer = "";
					prop = null;
					frame = {};
					isFrameStarted = false;
				}
				else
				{
					buffer += c;
					i++;
				}
			}
			keyframes = result;
		}

		// Convert the keyframes object into
		// individual properties
		for (i in keyframes)
		{
			this.addTween(instance, keyframes[i], parseInt(i, 10));
		}
	};

	/**
	 * Add a tween to the clip
	 * @method addTween
	 * @param {PIXI.DisplayObject} instance The clip to tween
	 * @param {Object} properties The property or property to tween
	 * @param {int} startFrame The frame to start tweening
	 * @param {int} [duration=0] Number of frames to tween. If 0, then the properties are set
	 *                           with no tweening.
	 * @param {Function} [ease] An optional easing function that takes the tween time from 0-1.
	 * @return {MovieClip}
	 */
	/**
	 * Alias for method `addTween`
	 * @method tw
	 * @return {MovieClip}
	 */
	p.tw = p.addTween = function(instance, properties, startFrame, duration, ease)
	{
		duration = duration || 0;

		//1. determine if there is already a tween for this instance, and if so prepare to add it
		//   on/insert it - if there isn't, then make one and set up a wait until startFrame
		var timeline, i;
		for (i = this._timelines.length - 1; i >= 0; --i)
		{
			if (this._timelines[i].target == instance)
			{
				timeline = this._timelines[i];
				break;
			}
		}
		if (!timeline)
		{
			timeline = new Timeline(instance);
			this._timelines.push(timeline);
		}

		// Convert any string colors to uints
		if (typeof properties.t == "string")
		{
			properties.t = parseInt(properties.t.substr(1), 16);
		}
		else if (typeof properties.v == "number")
		{
			properties.v = !!properties.v;
		}

		//2. create the tween segment, recording the starting values of properties and using the
		//   supplied properties as the ending values
		timeline.addTween(instance, properties, startFrame, duration, ease);
		if (this._totalFrames < startFrame + duration)
			this._totalFrames = startFrame + duration;
		return this;
	};

	/**
	 * Add a child to show for a certain number of frames before automatic removal.
	 * @method addTimedChild
	 * @param {PIXI.DisplayObject} instance The clip to show
	 * @param {int} startFrame The starting frame
	 * @param {int} [duration=1] The number of frames to display the child before removing it.
	 * @param {String|Array} [keyframes] The collection of static keyframes to add
	 * @return {MovieClip}
	 */
	/**
	 * Alias for method `addTimedChild`
	 * @method at
	 * @return {MovieClip}
	 */
	p.at = p.addTimedChild = function(instance, startFrame, duration, keyframes)
	{
		if (startFrame == null) // jshint ignore:line
			startFrame = 0;
		if (duration == null || duration < 1) // jshint ignore:line
			duration = this._totalFrames || 1;

		// Add the starting offset for synced movie clips
		if (instance.mode === MovieClip.SYNCHED)
		{
			instance.parentStartPosition = startFrame;
		}

		//add tweening info about this child's presence on stage
		//when the child is (re)added, if it has 'autoReset' set to true, then it
		//should be set back to frame 0
		var timeline, i;
		//get existing timeline
		for (i = this._timedChildTimelines.length - 1; i >= 0; --i)
		{
			if (this._timedChildTimelines[i].target == instance)
			{
				timeline = this._timedChildTimelines[i];
				break;
			}
		}
		//if there wasn't one, make a new one
		if (!timeline)
		{
			timeline = [];
			timeline.target = instance;
			this._timedChildTimelines.push(timeline);
		}
		//ensure that the timeline is long enough
		var oldLength = timeline.length;
		if (oldLength < startFrame + duration)
		{
			timeline.length = startFrame + duration;
			//fill any gaps with false to denote that the child should be removed for a bit
			if (oldLength < startFrame)
			{
				//if the browser has implemented the ES6 fill() function, use that
				if (timeline.fill)
					timeline.fill(false, oldLength, startFrame);
				else
				{
					//if we can't use fill, then do a for loop to fill it
					for (i = oldLength; i < startFrame; ++i)
						timeline[i] = false;
				}
			}
		}
		//if the browser has implemented the ES6 fill() function, use that
		if (timeline.fill)
			timeline.fill(true, startFrame, startFrame + duration);
		else
		{
			var length = timeline.length;
			//if we can't use fill, then do a for loop to fill it
			for (i = startFrame; i < length; ++i)
				timeline[i] = true;
		}
		if (this._totalFrames < startFrame + duration)
			this._totalFrames = startFrame + duration;

		// Add the collection of keyframes
		this.addKeyframes(instance, keyframes);

		// Set the initial position/add
		this._setTimelinePosition(startFrame, this.currentFrame, true);

		return this;
	};

	/**
	 * Handle frame actions, callback is bound to the instance of the MovieClip
	 * @method addAction
	 * @param {Function} callback The clip call on a certain frame
	 * @param {int} startFrame The starting frame
	 * @return {MovieClip}
	 */
	p.aa = p.addAction = function(callback, startFrame)
	{
		var actions = this._actions;
		//ensure that the movieclip timeline is long enough to support the target frame
		if (actions.length <= startFrame)
			actions.length = startFrame + 1;
		if (this._totalFrames < startFrame)
			this._totalFrames = startFrame;
		//add the action
		if (actions[startFrame])
		{
			actions[startFrame].push(callback);
		}
		else
		{
			actions[startFrame] = [callback];
		}
		return this;
	};

	/**
	 * Sets paused to false.
	 * @method play
	 **/
	p.play = function()
	{
		this.paused = false;
	};

	/**
	 * Sets paused to true.
	 * @method stop
	 **/
	p.stop = function()
	{
		this.paused = true;
	};

	/**
	 * Advances this movie clip to the specified position or label and sets paused to false.
	 * @method gotoAndPlay
	 * @param {String|Number} positionOrLabel The animation name or frame number to go to.
	 **/
	p.gotoAndPlay = function(positionOrLabel)
	{
		this.paused = false;
		this._goto(positionOrLabel);
	};

	/**
	 * Advances this movie clip to the specified position or label and sets paused to true.
	 * @method gotoAndStop
	 * @param {String|Number} positionOrLabel The animation or frame name to go to.
	 **/
	p.gotoAndStop = function(positionOrLabel)
	{
		this.paused = true;
		this._goto(positionOrLabel);
	};

	/**
	 * Advances the playhead. This occurs automatically each tick by default.
	 * @param [time] {Number} The amount of time in seconds to advance by. Only applicable if framerate is set.
	 * @method advance
	 */
	p.advance = function(time)
	{
		if (!this._framerate)
		{
			var o = this,
				fps = o._framerate;
			while ((o = o.parent) && !fps)
			{
				if (o.mode == MovieClip.INDEPENDENT)
				{
					fps = o._framerate;
				}
			}
			this.framerate = fps;
		}

		if (time)
			this._t += time;
		if (this._t > this._duration)
			this._t = this.loop ? this._t - this._duration : this._duration;
		//add a tiny amount to account for potential floating point errors
		this.currentFrame = Math.floor(this._t * this._framerate + 0.00000001);
		//final error checking
		if (this.currentFrame >= this._totalFrames)
			this.currentFrame = this._totalFrames - 1;
		//update all tweens & actions in the timeline
		this._updateTimeline();
	};

	/**
	 * @method _goto
	 * @param {String|Number} positionOrLabel The animation name or frame number to go to.
	 * @protected
	 **/
	p._goto = function(positionOrLabel)
	{
		var pos = typeof positionOrLabel == "string" ? this._labelDict[positionOrLabel] : positionOrLabel;
		if (pos == null) // jshint ignore:line
		{
			return;
		}
		// prevent _updateTimeline from overwriting the new position because of a reset:
		if (this._prevPos == -1)
		{
			this._prevPos = NaN;
		}
		this.currentFrame = pos;
		//update the elapsed time if a time based movieclip
		if (this._framerate > 0)
			this._t = pos / this._framerate;
		else
			this._t = 0;
		this._updateTimeline();
	};

	/**
	 * @method _reset
	 * @private
	 **/
	p._reset = function()
	{
		this._prevPos = -1;
		this._t = 0;
		this.currentFrame = 0;
	};

	/**
	 * @method _updateTimeline
	 * @protected
	 **/
	p._updateTimeline = function()
	{
		var synched = this.mode != MovieClip.INDEPENDENT;

		if (synched)
		{
			this.currentFrame = this.startPosition + (this.mode == MovieClip.SINGLE_FRAME ? 0 : this._synchOffset);
			if (this.currentFrame >= this._totalFrames)
				this.currentFrame %= this._totalFrames;
		}

		if (this._prevPos == this.currentFrame)
		{
			return;
		}

		// update timeline position, ignoring actions if this is a graphic.
		var startFrame = this._prevPos < 0 ? 0 : this._prevPos;
		this._setTimelinePosition(startFrame, this.currentFrame, synched ? false : this.actionsEnabled);

		this._prevPos = this.currentFrame;
	};

	/**
	 * Set the timeline position
	 * @method _setTimelinePostion
	 * @protected
	 * @param {int} startFrame
	 * @param {int} currentFrame
	 * @param {Boolean} doActions
	 */
	p._setTimelinePosition = function(startFrame, currentFrame, doActions)
	{
		//handle all tweens
		var i, j, length, _timelines = this._timelines;
		for (i = _timelines.length - 1; i >= 0; --i)
		{
			var timeline = _timelines[i];
			for (j = 0, length = timeline.length; j < length; ++j)
			{
				var tween = timeline[j];
				//if the tween contains part of the timeline that we are travelling through
				if (currentFrame >= tween.startFrame &&
					currentFrame <= tween.endFrame)
				{
					// set the position within that tween
					//and break the loop to move onto the next timeline
					tween.setPosition(currentFrame);
					break;
				}
			}
		}
		//TODO: handle children removal and adding - try to avoid adding & removing each child
		//each frame the way CreateJS does
		var _timedChildTimelines = this._timedChildTimelines;
		for (i = 0, length = _timedChildTimelines.length; i < length; ++i)
		{
			var target = _timedChildTimelines[i].target;
			var shouldBeChild = _timedChildTimelines[i][currentFrame];
			//if child should be on stage and is not:
			if (shouldBeChild && target.parent != this)
			{
				this.addChild(target);
				if (target.mode == MovieClip.INDEPENDENT && target.autoReset)
					target._reset();
			}
			else if (!shouldBeChild && target.parent == this)
			{
				this.removeChild(target);
			}
		}

		//go through all children and update synched movieclips that are not single frames
		var children = this.children,
			child;
		for (i = 0, length = children.length; i < length; ++i)
		{
			child = children[i];
			if (child.mode == MovieClip.SYNCHED)
			{
				child._synchOffset = currentFrame - child.parentStartPosition;
				child._updateTimeline();
			}
		}

		//handle actions
		if (doActions)
		{
			var actions = this._actions;
			//handle looping around
			var needsLoop = false;
			if (currentFrame < startFrame)
			{
				length = actions.length;
				needsLoop = true;
			}
			else
				length = Math.min(currentFrame + 1, actions.length);
			for (i = startFrame, length = Math.min(currentFrame + 1, actions.length); i < length; ++i)
			{
				if (actions[i])
				{
					var frameActions = actions[i];
					for (j = 0; j < frameActions.length; ++j)
						frameActions[j].call(this);
				}
				//handle looping around
				if (needsLoop && i == length - 1)
				{
					i = 0;
					length = currentFrame + 1;
					needsLoop = false;
				}
			}
		}
	};

	p.__Container_destroy = p.destroy;
	p.destroy = function(destroyChildren)
	{
		if (this._tickListener)
		{
			SharedTicker.remove(this._tickListener);
			this._tickListener = null;
		}

		this.__Container_destroy(destroyChildren);
	};

	/**
	 * Extend a container
	 * @method extend
	 * @static
	 * @param {MovieClip} child The child function
	 * @return {MovieClip} THe child
	 */
	MovieClip.extend = MovieClip.e = function(child)
	{
		child.prototype = Object.create(p);
		child.prototype.__parent = p;
		child.prototype.constructor = child;
		return child;
	};

	// Assign to namespace
	PIXI.animate.MovieClip = MovieClip;

}(PIXI));