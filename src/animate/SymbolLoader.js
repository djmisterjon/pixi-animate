/**
 * @module PixiAnimate
 * @namespace PIXI.animate
 */
(function(PIXI)
{
	var ShapesCache = PIXI.animate.ShapesCache;
	var Texture = PIXI.Texture;
	var Loader = PIXI.loaders.Loader;

	/**
	 * The middleware for PIXI's ResourceLoader to be able to 
	 * load Flash symbols such as graphics and images.
	 * @class SymbolLoader
	 */
	var SymbolLoader = function()
	{
		return function(resource, next)
		{
			var url = resource.url;
			var data = resource.data;

			if (/\.shapes\.txt$/i.test(url))
			{
				ShapesCache.decode(data);
			}
			else if (/\.shapes.json$/i.test(url))
			{
				for (var name in data)
				{
					ShapesCache.add(name, data[name]);
				}
			}
			else if (data.nodeName && data.nodeName == "IMG")
			{
				// Add individual images to the texture cache by their
				// short symbol name, not the URL
				Texture.addTextureToCache(
					Texture.fromFrame(url),
					resource.name
				);
			}
			next();
		};
	};

	// Assign to the loader
	Loader.addPixiMiddleware(SymbolLoader);

}(PIXI));