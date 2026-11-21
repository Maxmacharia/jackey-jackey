var gsw = ee.Image('JRC/GSW1_2/GlobalSurfaceWater');

var beforeStart = '2017-05-01';
var beforeEnd = '2017-10-31';
var afterStart = '2017-11-01';
var afterEnd = '2018-04-30';

// var ernakulam = admin2.filter(ee.Filter.eq('ADM2_NAME', 'Ernakulam'))
// Lock geometry (never overwrite this)
var aoiGeom = aoi.geometry();
print("Geometry details", aoiGeom)
Map.centerObject(aoiGeom, 10);

var mangroveDict = ee.Dictionary({
  '2017': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2017')
  //'2018': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2018')
  //'2019': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2019')
  //'2020': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2020')
  //'2021': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2021')
  //'2022': ee.Image('projects/sixth-shield-437405-f4/assets/mangrove_extent_2022')
});

function getMangroveMask(year) {
  var yearStr = ee.Number(year).format('%.0f');
  return ee.Image(mangroveDict.get(yearStr))
    .select('b1')
    .gt(0)
    .rename('mangrove')
    .clip(aoiGeom);
}

// Mangrove mask (2022)
var mangroveMask = getMangroveMask(2017).selfMask();

// Map.addLayer(geometry, {color: 'grey'}, 'Ernakulam District')

var collection= ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode','IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')) 
  .filter(ee.Filter.eq('resolution_meters',10))
  .filterBounds(aoiGeom)
  .select('VH');

var beforeCollection = collection.filterDate(beforeStart, beforeEnd)
var afterCollection = collection.filterDate(afterStart,afterEnd)

var before = beforeCollection.mosaic().clip(aoiGeom);
var after = afterCollection.mosaic().clip(aoiGeom);
var wet = afterCollection.median().clip(aoiGeom);

Map.addLayer(before, {min:-25,max:0}, 'Before Floods', false);
Map.addLayer(after, {min:-25,max:0}, 'After Floods', false); 

var beforeFiltered = ee.Image(toDB(RefinedLee(toNatural(before))))
var afterFiltered = ee.Image(toDB(RefinedLee(toNatural(after))))

function otsu(histDict) {
  var hist = ee.Array(histDict.get('histogram'));
  var bins = ee.Array(histDict.get('bucketMeans'));

  var total = hist.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sumTotal = bins.multiply(hist)
                     .reduce(ee.Reducer.sum(), [0])
                     .get([0]);

  var nBins = ee.Number(hist.length().get([0]));  // FIX

  var init = ee.Dictionary({
    wB: ee.Number(0),
    sumB: ee.Number(0),
    maxBetween: ee.Number(0),
    threshold: ee.Number(0)
  });

  var result = ee.List.sequence(0, nBins.subtract(1))
    .iterate(function(i, prev) {
      prev = ee.Dictionary(prev);

      var wi = ee.Number(hist.get([i]));
      var wB = ee.Number(prev.get('wB')).add(wi);
      var wF = ee.Number(total).subtract(wB);

      var sumB = ee.Number(prev.get('sumB'))
        .add(ee.Number(bins.get([i])).multiply(wi));

      var mB = sumB.divide(wB);
      var mF = ee.Number(sumTotal).subtract(sumB).divide(wF);

      var between = wB.multiply(wF).multiply(mB.subtract(mF).pow(2));

      return ee.Dictionary({
        wB: wB,
        sumB: sumB,
        maxBetween: ee.Algorithms.If(
          between.gt(prev.get('maxBetween')),
          between,
          prev.get('maxBetween')
        ),
        threshold: ee.Algorithms.If(
          between.gt(prev.get('maxBetween')),
          bins.get([i]),
          prev.get('threshold')
        )
      });
    }, init);

  return ee.Number(ee.Dictionary(result).get('threshold'));
}

Map.addLayer(beforeFiltered, {min:-25,max:0}, 'Before Filtered', false);
Map.addLayer(afterFiltered, {min:-25,max:0}, 'After Filtered', false); 

var difference = afterFiltered.divide(beforeFiltered);

// Check the histogram of the DIFFERENCE image
var chart = ui.Chart.image.histogram({
  image: difference,
  region: aoiGeom,
  scale: 100, // Large scale to speed up computation
  maxBuckets: 256
});
print('Difference Histogram', chart);

var histWet = afterFiltered.reduceRegion({
  reducer: ee.Reducer.histogram({maxBuckets: 256}),
  geometry: aoiGeom,
  scale: 30,
  maxPixels: 1e13
}).get('sum');

print("histogram wet",histWet)

var Threshold = otsu(ee.Dictionary(histWet));
print('Otsu Threshold', Threshold);

// Define a threshold
var diffThreshold = 1.108;
// Initial estimate of flooded pixels
var flooded = difference.gt(diffThreshold).rename('water').selfMask();
Map.addLayer(flooded, {min:0, max:1, palette: ['orange']}, 'Initial Flood Area', false);


// Mask out area with permanent/semi-permanent water
var permanentWater = gsw.select('seasonality').gte(5).clip(aoiGeom)
var flooded = flooded.where(permanentWater, 0).selfMask()
Map.addLayer(permanentWater.selfMask(), {min:0, max:1, palette: ['blue']}, 'Permanent Water')

// Mask out areas with more than 5 percent slope using the HydroSHEDS DEM
var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(hydrosheds);
var slope = terrain.select('slope');
var flooded = flooded.updateMask(slope.lt(slopeThreshold));
Map.addLayer(slope.gte(slopeThreshold).selfMask(), {min:0, max:1, palette: ['cyan']}, 'Steep Areas', false)

        
// Remove isolated pixels
// connectedPixelCount is Zoom dependent, so visual result will vary
var connectedPixelThreshold = 8;
var connections = flooded.connectedPixelCount(25)
var flooded = flooded.updateMask(connections.gt(connectedPixelThreshold))
Map.addLayer(connections.lte(connectedPixelThreshold).selfMask(), {min:0, max:1, palette: ['yellow']}, 'Disconnected Areas', false)

var floodedMangroves = flooded
  .updateMask(mangroveMask)
  .rename('flooded_mangrove');

Map.addLayer(
  floodedMangroves,
  {palette: ['red']},
  'Flooded Mangroves Only'
);


Map.addLayer(flooded, {min:0, max:1, palette: ['red']}, 'Flooded Areas');
Map.addLayer(mangrove_2017, {min: 0, max: 1, palette: ['white', 'darkgreen']}, 'Mangrove Mask 2020');
// Calculate Affected Area
print('Total District Area (Ha)', aoiGeom.area().divide(10000))

var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoiGeom,
  scale: 30,
  maxPixels: 1e10,
  tileScale: 16
})
print('Flooded Area (Ha)', ee.Number(stats.get('water')).divide(10000))

// If the above computation times out, you can export it
var flooded_area = ee.Number(stats.get('water')).divide(10000);
var feature = ee.Feature(null, {'flooded_area': flooded_area})
var fc = ee.FeatureCollection([feature])

// Binary flood mask (0 = no flood, 1 = flood)
var floodBinary = difference.gt(diffThreshold)
  .rename('flood')
  .unmask(0);

floodBinary = floodBinary.where(permanentWater, 0);
floodBinary = floodBinary.updateMask(slope.lt(slopeThreshold));
floodBinary = floodBinary.updateMask(
  floodBinary.connectedPixelCount(25).gt(connectedPixelThreshold)
);

Export.table.toDrive({
  collection: fc, 
  description: 'Flooded_Area_Export',
  folder: 'earthengine',
  fileNamePrefix: 'flooded_area',
  fileFormat: 'CSV'})
  
  
// ------------------------------
// USPED analysis
// ------------------------------

// DEM (HydroSHEDS already in your script)
// var dem = hydrosheds.clip(aoiGeom);

// // Terrain derivatives
// var terrain = ee.Algorithms.Terrain(dem);
// var slopeRad = terrain.select('slope').multiply(Math.PI / 180);
// var aspectRad = terrain.select('aspect').multiply(Math.PI / 180);

// // Flow accumulation (HydroSHEDS)
// var flowAccum = ee.Image('WWF/HydroSHEDS/15ACC')
//   .clip(aoiGeom)
//   .rename('flowacc');

// var m = 1.3;
// var n = 1.2;

// var Tc = flowAccum
//   .pow(m)
//   .multiply(slopeRad.sin().pow(n))
//   .rename('Tc');

// // Gradients
// var dTdx = Tc.gradient().select('x');
// var dTdy = Tc.gradient().select('y');

// // Divergence (USPED erosion-deposition index)
// var erosionDeposition = dTdx.add(dTdy)
//   .rename('erosion_deposition');

// var uspED_mangroves = erosionDeposition
//   .updateMask(mangroveMask)
//   .clip(aoiGeom);

// var erosion = uspED_mangroves.lt(0).selfMask();      // erosion
// var deposition = uspED_mangroves.gt(0).selfMask();  // deposition

// Map.addLayer(uspED_mangroves, {
//   min: -50,
//   max: 50,
//   palette: ['red', 'white', 'blue']
// }, 'USPED Erosion–Deposition (Mangroves)', false);

// Map.addLayer(erosion, {palette: ['red']}, 'Erosion Zones', false);
// Map.addLayer(deposition, {palette: ['blue']}, 'Deposition Zones', false);

// -------------------------------
// NDVI ANALYSIS
// -------------------------------

// 1. Define Landsat 8 Cloud Masking Function
function maskL8sr(image) {
  // Bitmask for Dilated Cloud, Cirrus, Cloud, and Cloud Shadow
  var qa = image.select('QA_PIXEL');
  
  // Bit 1: Dilated Cloud, Bit 3: Cloud, Bit 4: Cloud Shadow
  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0));

  return image.updateMask(mask);
}

// 3. Load Landsat 8 Collection 2 Level 2 (Surface Reflectance)
var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(aoiGeom)
  .filterDate(beforeStart, afterEnd)
  .map(maskL8sr)
  .median()
  .clip(aoiGeom);

var ndvi = landsat8.normalizedDifference(['SR_B5', 'SR_B4'])
  .rename('NDVI');

var ndviMangroves = ndvi.updateMask(mangroveMask);
var ndviFlooded = ndviMangroves
  .updateMask(flooded)
  .rename('NDVI_flooded');

print("ndviFlooded", ndviFlooded);

var ndviNonFlooded = ndviMangroves
  .updateMask(floodBinary.eq(0))
  .rename('NDVI_nonflooded');

print("ndviNonFlooded", ndviNonFlooded);

Map.addLayer(ndviFlooded, {
  min: -0.26,
  max: 0.53,
  palette: ['brown', 'yellow', 'green']
}, 'NDVI – Flooded Mangroves');

Map.addLayer(ndviNonFlooded, {
  min: -0.26,
  max: 0.53,
  palette: ['brown', 'yellow', 'darkgreen']
}, 'NDVI – Non-Flooded Mangroves', false);


//############################
// Speckle Filtering Functions
//############################

// Function to convert from dB
function toNatural(img) {
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

//Function to convert to dB
function toDB(img) {
  return ee.Image(img).log10().multiply(10.0);
}

//Apllying a Refined Lee Speckle filter as coded in the SNAP 3.0 S1TBX:

//https://github.com/senbox-org/s1tbx/blob/master/s1tbx-op-sar-processing/src/main/java/org/esa/s1tbx/sar/gpf/filtering/SpeckleFilters/RefinedLee.java
//Adapted by Guido Lemoine

// by Guido Lemoine
function RefinedLee(img) {
  // img must be in natural units, i.e. not in dB!
  // Set up 3x3 kernels 
  var weights3 = ee.List.repeat(ee.List.repeat(1,3),3);
  var kernel3 = ee.Kernel.fixed(3,3, weights3, 1, 1, false);

  var mean3 = img.reduceNeighborhood(ee.Reducer.mean(), kernel3);
  var variance3 = img.reduceNeighborhood(ee.Reducer.variance(), kernel3);

  // Use a sample of the 3x3 windows inside a 7x7 windows to determine gradients and directions
  var sample_weights = ee.List([[0,0,0,0,0,0,0], [0,1,0,1,0,1,0],[0,0,0,0,0,0,0], [0,1,0,1,0,1,0], [0,0,0,0,0,0,0], [0,1,0,1,0,1,0],[0,0,0,0,0,0,0]]);

  var sample_kernel = ee.Kernel.fixed(7,7, sample_weights, 3,3, false);

  // Calculate mean and variance for the sampled windows and store as 9 bands
  var sample_mean = mean3.neighborhoodToBands(sample_kernel); 
  var sample_var = variance3.neighborhoodToBands(sample_kernel);

  // Determine the 4 gradients for the sampled windows
  var gradients = sample_mean.select(1).subtract(sample_mean.select(7)).abs();
  gradients = gradients.addBands(sample_mean.select(6).subtract(sample_mean.select(2)).abs());
  gradients = gradients.addBands(sample_mean.select(3).subtract(sample_mean.select(5)).abs());
  gradients = gradients.addBands(sample_mean.select(0).subtract(sample_mean.select(8)).abs());

  // And find the maximum gradient amongst gradient bands
  var max_gradient = gradients.reduce(ee.Reducer.max());

  // Create a mask for band pixels that are the maximum gradient
  var gradmask = gradients.eq(max_gradient);

  // duplicate gradmask bands: each gradient represents 2 directions
  gradmask = gradmask.addBands(gradmask);

  // Determine the 8 directions
  var directions = sample_mean.select(1).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(7))).multiply(1);
  directions = directions.addBands(sample_mean.select(6).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(2))).multiply(2));
  directions = directions.addBands(sample_mean.select(3).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(5))).multiply(3));
  directions = directions.addBands(sample_mean.select(0).subtract(sample_mean.select(4)).gt(sample_mean.select(4).subtract(sample_mean.select(8))).multiply(4));
  // The next 4 are the not() of the previous 4
  directions = directions.addBands(directions.select(0).not().multiply(5));
  directions = directions.addBands(directions.select(1).not().multiply(6));
  directions = directions.addBands(directions.select(2).not().multiply(7));
  directions = directions.addBands(directions.select(3).not().multiply(8));

  // Mask all values that are not 1-8
  directions = directions.updateMask(gradmask);

  // "collapse" the stack into a singe band image (due to masking, each pixel has just one value (1-8) in it's directional band, and is otherwise masked)
  directions = directions.reduce(ee.Reducer.sum());  

  //var pal = ['ffffff','ff0000','ffff00', '00ff00', '00ffff', '0000ff', 'ff00ff', '000000'];
  //Map.addLayer(directions.reduce(ee.Reducer.sum()), {min:1, max:8, palette: pal}, 'Directions', false);

  var sample_stats = sample_var.divide(sample_mean.multiply(sample_mean));

  // Calculate localNoiseVariance
  var sigmaV = sample_stats.toArray().arraySort().arraySlice(0,0,5).arrayReduce(ee.Reducer.mean(), [0]);

  // Set up the 7*7 kernels for directional statistics
  var rect_weights = ee.List.repeat(ee.List.repeat(0,7),3).cat(ee.List.repeat(ee.List.repeat(1,7),4));

  var diag_weights = ee.List([[1,0,0,0,0,0,0], [1,1,0,0,0,0,0], [1,1,1,0,0,0,0], 
    [1,1,1,1,0,0,0], [1,1,1,1,1,0,0], [1,1,1,1,1,1,0], [1,1,1,1,1,1,1]]);

  var rect_kernel = ee.Kernel.fixed(7,7, rect_weights, 3, 3, false);
  var diag_kernel = ee.Kernel.fixed(7,7, diag_weights, 3, 3, false);

  // Create stacks for mean and variance using the original kernels. Mask with relevant direction.
  var dir_mean = img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel).updateMask(directions.eq(1));
  var dir_var = img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel).updateMask(directions.eq(1));

  dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel).updateMask(directions.eq(2)));
  dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel).updateMask(directions.eq(2)));

  // and add the bands for rotated kernels
  for (var i=1; i<4; i++) {
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), rect_kernel.rotate(i)).updateMask(directions.eq(2*i+1)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), rect_kernel.rotate(i)).updateMask(directions.eq(2*i+1)));
    dir_mean = dir_mean.addBands(img.reduceNeighborhood(ee.Reducer.mean(), diag_kernel.rotate(i)).updateMask(directions.eq(2*i+2)));
    dir_var = dir_var.addBands(img.reduceNeighborhood(ee.Reducer.variance(), diag_kernel.rotate(i)).updateMask(directions.eq(2*i+2)));
  }

  // "collapse" the stack into a single band image (due to masking, each pixel has just one value in it's directional band, and is otherwise masked)
  dir_mean = dir_mean.reduce(ee.Reducer.sum());
  dir_var = dir_var.reduce(ee.Reducer.sum());

  // A finally generate the filtered value
  var varX = dir_var.subtract(dir_mean.multiply(dir_mean).multiply(sigmaV)).divide(sigmaV.add(1.0));

  var b = varX.divide(dir_var);

  var result = dir_mean.add(b.multiply(img.subtract(dir_mean)));
  return(result.arrayFlatten([['sum']]));
}

// 1. Timeframes (using your defined dates)
var Start = '2017-05-30';
var End = '2018-05-30';

// -----------------------------------------------------------------------
// A. R-FACTOR: Rainfall Intensity (CHIRPS)
// -----------------------------------------------------------------------
var chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
  .filterDate(Start, End)
  .filterBounds(aoiGeom);

// Calculate total rainfall for the period (proxy for erosivity)
var totalRainfall = chirps.sum().clip(aoiGeom);
// Normalize rainfall to a scale (simplified R-factor approach)
var R_factor = totalRainfall.divide(100).rename('R');
print("R_factor", R_factor);

// Convert NDVI to C-factor: C = exp(-alpha * (NDVI / (1 - NDVI)))
// High NDVI = Low C (less erosion); Low NDVI = High C (more erosion)
var C_factor = ndvi.multiply(-2).exp().rename('C');

// -----------------------------------------------------------------------
// C. TOPOGRAPHY: LS-FACTOR (HydroSHEDS)
// -----------------------------------------------------------------------
var dem = hydrosheds.clip(aoiGeom);
var terrain = ee.Algorithms.Terrain(dem);
var slopeRad = terrain.select('slope').multiply(Math.PI / 180);
var flowAccum = ee.Image('WWF/HydroSHEDS/15ACC').clip(aoiGeom);

var m = 1.6; // Rill erosion exponent
var n = 1.3; // Sheet erosion exponent

// Basic Sediment Transport Capacity (Tc)
var Tc_static = flowAccum.pow(m).multiply(slopeRad.sin().pow(n));

// -----------------------------------------------------------------------
// D. INTEGRATED DYNAMIC USPED
// -----------------------------------------------------------------------
// Formula: Dynamic_Tc = R * C * Static_Tc
var Tc_dynamic = Tc_static.multiply(R_factor).multiply(C_factor).rename('Tc_dynamic');

// Divergence for Erosion/Deposition
var dTdx = Tc_dynamic.gradient().select('x');
var dTdy = Tc_dynamic.gradient().select('y');
var erosionDeposition = dTdx.add(dTdy).rename('erosion_deposition');

// -----------------------------------------------------------------------
// E. MASKING AND SEGMENTATION
// -----------------------------------------------------------------------
// Mask to Mangroves
var uspED_mangroves = erosionDeposition.updateMask(mangroveMask);

// Segment NDVI by Flood Status (using your previously calculated 'flooded' layer)
// var ndviFlooded = ndvi.updateMask(flooded);
// var ndviNonFlooded = ndvi.updateMask(flooded.unmask().not());

// -----------------------------------------------------------------------
// F. VISUALIZATION
// -----------------------------------------------------------------------
Map.addLayer(ndvi, {min: 0, max: 1, palette: ['red', 'yellow', 'green']}, 'NDVI (Vegetation Status)');
Map.addLayer(totalRainfall, {min: 500, max: 2000, palette: ['white', 'blue']}, 'Total Rainfall (CHIRPS)');

Map.addLayer(uspED_mangroves, {
  min: -10, 
  max: 10, 
  palette: ['#d7191c', '#ffffff', '#2b83ba']
}, 'Dynamic USPED (Mangroves)');

// Final Statistics
print('Mean Rainfall for Period (mm)', totalRainfall.reduceRegion(ee.Reducer.mean(), aoiGeom, 1000));

// -----------------------------------------------------------------------
// G. SEPARATE EROSION AND DEPOSITION
// -----------------------------------------------------------------------

// 1. Isolate Erosion (Negative values)
// We use .lt(0) to create a mask, then .selfMask() to hide everything else
var erosion = erosionDeposition.updateMask(erosionDeposition.lt(0))
  .rename('erosion');

// 2. Isolate Deposition (Positive values)
// We use .gt(0) to create a mask, then .selfMask() to hide everything else
var deposition = erosionDeposition.updateMask(erosionDeposition.gt(0))
  .rename('deposition');

// 3. Mask to Mangroves specifically (if needed for extraction)
var erosionMangroves = erosion.updateMask(mangroveMask);
var depositionMangroves = deposition.updateMask(mangroveMask);

// Calculate Total Eroded Area (Ha) in Mangroves
var erosionStats = erosionMangroves.abs().multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoiGeom,
  scale: 30,
  maxPixels: 1e13
});
print('Total Erosion in Mangroves (Estimates)', erosionStats);

// Calculate Total Deposition Area (Ha) in Mangroves
var depositionStats = depositionMangroves.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoiGeom,
  scale: 30,
  maxPixels: 1e13
});
print('Total Deposition in Mangroves (Estimates)', depositionStats);

// -----------------------------------------------------------------------
// H. VISUALIZATION
// -----------------------------------------------------------------------

// Visualize Erosion in shades of Red
Map.addLayer(erosionMangroves, {
  min: -10, 
  max: 0, 
  palette: ['#67000d', '#fb6a4a', '#fff5f0']
}, 'Mangrove Erosion Zones');

// Visualize Deposition in shades of Blue
Map.addLayer(depositionMangroves, {
  min: 0, 
  max: 10, 
  palette: ['#fff7fb', '#74a9cf', '#023858']
}, 'Mangrove Deposition Zones');
// -----------------------------------------------------------------------
// H. VISUALIZATION
// -----------------------------------------------------------------------

// Visualize Erosion in shades of Red
Map.addLayer(erosionMangroves, {
  min: -10, 
  max: 0, 
  palette: ['#67000d', '#fb6a4a', '#fff5f0']
}, 'Mangrove Erosion Zones');

// Visualize Deposition in shades of Blue
Map.addLayer(depositionMangroves, {
  min: 0, 
  max: 10, 
  palette: ['#fff7fb', '#74a9cf', '#023858']
}, 'Mangrove Deposition Zones');

Export.image.toDrive({
  image: difference,
  description: 'difference_2017',
  folder: 'GEE_NDWI',
  fileNamePrefix: 'difference_2017',
  region: aoiGeom,
  scale: null,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: erosion,
  description: 'erosion_2017',
  folder: 'GEE_NDWI',
  fileNamePrefix: 'erosion_2017',
  region: aoiGeom,
  scale: null,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: deposition,
  description: 'deposition_2017',
  folder: 'GEE_NDWI',
  fileNamePrefix: 'deposition_2017',
  region: aoiGeom,
  scale: null,
  maxPixels: 1e13
});

// Export.image.toDrive({
//   image: ndviFlooded,
//   description: 'ndviFlooded_2017',
//   folder: 'GEE_NDWI',
//   fileNamePrefix: 'ndviFlooded_2017',
//   region: aoiGeom,
//   scale: null,
//   maxPixels: 1e13
// });

Export.image.toDrive({
  image: ndviNonFlooded,
  description: 'ndviNonFlooded_2017',
  folder: 'GEE_NDWI',
  fileNamePrefix: 'ndviNonFlooded_2017',
  region: aoiGeom,
  scale: null,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: floodedMangroves.unmask(0).uint8(), 
  description: 'floodedMangroves_2017_Fixed',
  folder: 'GEE_FLOOD',
  fileNamePrefix: 'floodedMangroves_2017',
  region: aoiGeom,
  scale: 10, // Must be 10 for Sentinel-1 resolution
  maxPixels: 1e13
});

// 2. Export NDVI Flooded (Decimal values)
// We keep the mask here so you only see the mangrove values
Export.image.toDrive({
  image: ndviFlooded.float(), // Ensure it's floating point for decimals
  description: 'ndviFlooded_2017_Fixed',
  folder: 'GEE_NDVI',
  fileNamePrefix: 'ndviFlooded_2017',
  region: aoiGeom,
  scale: 10, // Must be 10 for Sentinel-2 resolution
  maxPixels: 1e13
});

Export.image.toDrive({
  image: erosionMangroves.float(),
  description: 'Mangrove_Erosion_2017',
  folder: 'GEE_USPED',
  fileNamePrefix: 'erosion_2017',
  region: aoiGeom,
  scale: 30, // Resolution of the DEM
  maxPixels: 1e13
});

Export.image.toDrive({
  image: depositionMangroves.float(),
  description: 'Mangrove_Deposition_2017',
  folder: 'GEE_USPED',
  fileNamePrefix: 'deposition_2017',
  region: aoiGeom,
  scale: 30,
  maxPixels: 1e13
});

