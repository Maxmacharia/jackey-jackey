# Sentinel-1 SAR Flood Mapping, Dynamic USPED Soil Erosion, and Mangrove NDVI Analysis in Google Earth Engine

## Overview

This Google Earth Engine (JavaScript API) script performs multi-sensor spatial analysis of flood inundation, dynamic soil erosion and deposition using the Unit Stream Power Erosion Deposition (USPED) model, and vegetation condition (NDVI) within mangrove ecosystems over a defined Area of Interest (`aoiGeom`). It corresponds to the Google Earth Engine analysis framework in the attached report (*"Assessing mangrove response to coastal and inland intertidal zones in northern Australia using multi-source remote sensing data"*, Jackey Jackey Creek, Far North Queensland, Australia)[cite: 17, 21, 23].

In the script, **Sentinel-1 SAR (IW mode, VH polarization, descending pass)** is speckle-filtered using a directional **Refined Lee** filter and thresholded to detect flood inundation[cite: 24], **JRC Global Surface Water** and a DEM (`hydrosheds`) mask permanent/semi-permanent water and steep terrain[cite: 24], **Landsat 8 Collection 2 Level 2** (`SR_B5`, `SR_B4`) computes **NDVI** across flooded and non-flooded mangrove zones[cite: 23], and **CHIRPS** rainfall, **NDVI**, and **HydroSHEDS** topography/flow accumulation parameterize dynamic USPED sediment transport divergence for mangrove erosion and deposition mapping[cite: 24].

## Datasets Used

### Spatial & Temporal Scope in the Script
- **Area of Interest (`aoiGeom`):** Locked via `var aoiGeom = aoi.geometry();` (with a commented-out `admin2` / `Ernakulam` example), while the attached report investigates **Jackey Jackey Creek** at the tip of Cape York Peninsula in Far North Queensland, Australia (bordering Newcastle Bay and the Torres Strait, within Jardine River National Park and the Northern Peninsula Area), spanning latitudes `11° 04′ 12" S` to `10° 47' 13" S` and longitudes `142° 24' 34" E` to `142° 45′ 05" E`[cite: 21].
- **Flood & NDVI Time Windows (in script):**
  - Pre-flood window: `beforeStart = '2017-05-01'` to `beforeEnd = '2017-10-31'`.
  - Post-flood window: `afterStart = '2017-11-01'` to `afterEnd = '2018-04-30'`.
  - Landsat 8 composite window: `beforeStart` to `afterEnd`.
- **USPED Rainfall Time Window (in script):** `Start = '2017-05-30'` to `End = '2018-05-30'`.
- **Reference Report Study Period:** `2017–2022` across Sentinel-1, Sentinel-2, Landsat 8, Digital Earth Australia (DEA) mangrove/coastline/land cover data, HydroSHEDS, JRC GSW, CHIRPS, MODIS, and Copernicus GLO-30 DEM[cite: 17, 22, 23].

### Earth Engine Datasets & Assets in the Script
- **Sentinel-1 GRD (`COPERNICUS/S1_GRD`):** Filtered to `instrumentMode == 'IW'`, `transmitterReceiverPolarisation` containing `'VH'`, `orbitProperties_pass == 'DESCENDING'`, `resolution_meters == 10`, bounded by `aoiGeom`, and selecting band `'VH'` (10 m resolution C-band SAR, selected because low water backscatter aids flood detection)[cite: 22, 24].
- **JRC Global Surface Water (`JRC/GSW1_2/GlobalSurfaceWater`):** Band `'seasonality'` (`>= 5`) clipped to `aoiGeom` to mask permanent/semi-permanent water (reported at 30 m resolution across 1984–2019)[cite: 22, 24].
- **HydroSHEDS & Flow Accumulation (`hydrosheds` variable and `WWF/HydroSHEDS/15ACC`):** Used in the script to derive terrain slope (`ee.Algorithms.Terrain`) and upslope flow accumulation (`WWF/HydroSHEDS/15ACC`) clipped to `aoiGeom` (report cites WWF/USGS HydroSHEDS void-filled DEM based on SRTM at 92.77 m resolution for inundation, erosion, and deposition analysis)[cite: 22, 24].
- **Mangrove Extent Asset (`mangroveDict` / `mangrove_2017`):** Script loads `'projects/sixth-shield-437405-f4/assets/mangrove_extent_2017'` (with commented-out keys for `2018`–`2022`), selects `'b1' > 0`, and clips to `aoiGeom` (the report uses DEA mangrove canopy extent/density and land cover datasets via STAC)[cite: 21, 23].
- **Landsat 8 Collection 2 Level 2 (`LANDSAT/LC08/C02/T1_L2`):** Filtered to `aoiGeom` and `beforeStart`–`afterEnd`, masked using `QA_PIXEL` bits `1` (Dilated Cloud), `3` (Cloud), and `4` (Cloud Shadow), median-composited, clipped to `aoiGeom`, and used to compute `NDVI = (SR_B5 - SR_B4) / (SR_B5 + SR_B4)`.
- **CHIRPS Daily (`UCSB-CHG/CHIRPS/DAILY`):** Filtered to `2017-05-30`–`2018-05-30` and `aoiGeom`, summed over the timeframe (`totalRainfall`), and divided by `100` to derive `R_factor`[cite: 24].

### Script Outputs & Drive Exports
- **Interactive Map Layers:** `Before Floods`, `After Floods`, `Before Filtered`, `After Filtered`, `Initial Flood Area`, `Permanent Water`, `Steep Areas`, `Disconnected Areas`, `Flooded Mangroves Only`, `Flooded Areas`, `Mangrove Mask 2020` (layer label in script while rendering `mangrove_2017`), `NDVI – Flooded Mangroves`, `NDVI – Non-Flooded Mangroves`, `NDVI (Vegetation Status)`, `Total Rainfall (CHIRPS)`, `Dynamic USPED (Mangroves)`, `Mangrove Erosion Zones`, and `Mangrove Deposition Zones` (with several USPED map layers commented out in the middle block and active in the later USPED block).
- **Console Outputs & Charts:** Geometry details, `Difference Histogram` chart, `histogram wet`, `Otsu Threshold`, `Total District Area (Ha)`, `Flooded Area (Ha)`, `ndviFlooded`, `ndviNonFlooded`, `R_factor`, `Mean Rainfall for Period (mm)`, `Total Erosion in Mangroves (Estimates)`, and `Total Deposition in Mangroves (Estimates)`.
- **Google Drive Export Tasks:**
  - Table CSV (`Export.table.toDrive`): `Flooded_Area_Export` in folder `earthengine` with prefix `flooded_area` (`flooded_area` in hectares).
  - Images (`Export.image.toDrive`):
    - Folder `GEE_NDWI`: `difference_2017` (`scale: null`), `erosion_2017` (`scale: null`), `deposition_2017` (`scale: null`), `ndviNonFlooded_2017` (`scale: null`), plus commented-out `ndviFlooded_2017`.
    - Folder `GEE_FLOOD`: `floodedMangroves_2017_Fixed` (`floodedMangroves.unmask(0).uint8()`, prefix `floodedMangroves_2017`, `scale: 10`).
    - Folder `GEE_NDVI`: `ndviFlooded_2017_Fixed` (`ndviFlooded.float()`, prefix `ndviFlooded_2017`, `scale: 10`).
    - Folder `GEE_USPED`: `Mangrove_Erosion_2017` (`erosionMangroves.float()`, prefix `erosion_2017`, `scale: 30`) and `Mangrove_Deposition_2017` (`depositionMangroves.float()`, prefix `deposition_2017`, `scale: 30`).

## Methodology

1. **SAR Speckle Filtering & Change Ratio:**
   - Before- and after-flood Sentinel-1 `VH` mosaics are clipped to `aoiGeom`, converted from dB to natural linear units (`toNatural`), filtered with a directional **Refined Lee** speckle filter across 8 gradient orientations (`RefinedLee`), and converted back to dB (`toDB`)[cite: 24].
   - A ratio/difference image (`afterFiltered.divide(beforeFiltered)`) is computed[cite: 24]. The script defines an `otsu(histDict)` function and computes `Threshold` from `afterFiltered` at `30 m` scale, while thresholding `difference.gt(diffThreshold)` with `diffThreshold = 1.108` (the report notes applying an Otsu threshold of `1.02` on post-event/pre-event filtered imagery)[cite: 24].
2. **Flood Refinement & Mangrove Masking:**
   - Permanent/semi-permanent water (`gsw.select('seasonality').gte(5)`) is set to `0`[cite: 24].
   - Areas with slope `>= slopeThreshold` (`5` in the script's slope mask; report notes masking steep topography prone to radar shadow artifacts) are masked out[cite: 24].
   - Isolated pixels are removed via `connectedPixelCount(25).gt(connectedPixelThreshold)` with `connectedPixelThreshold = 8`[cite: 24].
   - Resulting flood layers are masked by `mangroveMask` (`2017`) to isolate `floodedMangroves` and `floodBinary.eq(0)` for non-flooded areas.
3. **Landsat 8 Mangrove NDVI:**
   - Cloud/shadow-masked `LANDSAT/LC08/C02/T1_L2` median composite is used to calculate `NDVI = (SR_B5 - SR_B4) / (SR_B5 + SR_B4)`, then masked by `mangroveMask` and separated into `NDVI_flooded` and `NDVI_nonflooded`.
4. **Dynamic USPED Sediment Transport & Divergence:**
   - Following the USPED equations in the report[cite: 24]:
     - **Rainfall erosivity factor:** $R = \frac{\sum \text{Rainfall}_{\text{CHIRPS}}}{100}$[cite: 24].
     - **Cover management factor (in script):** $C = \exp(-2 \cdot \text{NDVI})$ (the report also lists $C = \exp(-2 \cdot \text{NDVI})$)[cite: 24].
     - **Static sediment transport capacity:** $T_{c,\text{static}} = A^{1.6} \cdot (\sin b)^{1.3}$, using upslope flow accumulation $A$ (`WWF/HydroSHEDS/15ACC`) and slope angle $b$ in radians (`m = 1.6`, `n = 1.3` in the active USPED section)[cite: 24].
     - **Dynamic transport capacity & net divergence:** $T_{c,\text{dynamic}} = T_{c,\text{static}} \cdot R \cdot C$, and net erosion/deposition divergence is $\text{ED} = \nabla \cdot T_{c,\text{dynamic}} = \frac{\partial T_{c,\text{dynamic}}}{\partial x} + \frac{\partial T_{c,\text{dynamic}}}{\partial y}$ (`dTdx.add(dTdy)`), where negative values indicate net erosion and positive values indicate net deposition[cite: 24].
   - Masked to `mangroveMask` (`erosionMangroves`, `depositionMangroves`) and summed with `ee.Image.pixelArea()` at `30 m` scale.

## Workflow

1. **Set AOI, Timeframes, and Mangrove Mask:** Lock `aoiGeom`, center map at zoom `10`, set before/after flood dates (`2017-05-01`–`2017-10-31` and `2017-11-01`–`2018-04-30`), and load the `2017` mangrove mask clipped to `aoiGeom`.
2. **Filter and Speckle-Filter Sentinel-1 SAR:** Filter `COPERNICUS/S1_GRD` (`IW`, `VH`, `DESCENDING`, `10 m`), mosaic before and after periods, and apply `toDB(RefinedLee(toNatural(...)))`[cite: 24].
3. **Threshold and Refine Flood Extent:** Compute `afterFiltered.divide(beforeFiltered)`, inspect histogram and Otsu threshold output, apply `diffThreshold = 1.108`, mask permanent water (`seasonality >= 5`), slope (`< 5`), and small connected components (`> 8` within `25` px radius), and compute flooded area in hectares[cite: 24].
4. **Compute Landsat 8 Mangrove NDVI:** Mask `QA_PIXEL` clouds/shadows on `LANDSAT/LC08/C02/T1_L2`, build median composite across `beforeStart`–`afterEnd`, compute `NDVI`, and mask by mangrove extent and flood/non-flood pixels.
5. **Compute Dynamic USPED Erosion & Deposition:** Sum CHIRPS daily rainfall (`2017-05-30`–`2018-05-30`) for `R_factor`, compute `C_factor` from `NDVI`, calculate `Tc_static` and `Tc_dynamic` from HydroSHEDS slope and flow accumulation, take gradient divergence (`dTdx + dTdy`), separate negative (erosion) and positive (deposition) values over mangroves, and sum area-weighted values at `30 m` scale[cite: 24].
6. **Visualize and Queue Exports:** Add layers to the map and configure CSV and GeoTIFF export tasks to Google Drive.

## Results

### Reported Findings in the Attached Study (Jackey Jackey Creek, 2017–2022)
From the attached report on Jackey Jackey Creek (2017–2022)[cite: 17, 26]:
- **Coastline Proximity Zones:** Most mangrove coverage occurred in Zone 4 (`> 1,000 m` from the annual coastline: `9,921.87 ha` / `70%` in 2017 to `14,203.26 ha` / `72%` in 2022, with a low of `11,208.24 ha` / `69.2%` in 2021), while Zone 1 (`< 100 m`) remained roughly `5.4%–5.6%` (`767.16 ha` in 2017 to `1,079.64 ha` in 2022)[cite: 17, 26].
- **Total & Forest-Class Coverage:** Total mangrove extent changed from `14,168.07 ha` in 2017 to `19,715.49 ha` in 2022[cite: 26, 27]. Closed forest share rose from `80.7%` (`11,440.44 ha`) in 2017 to `88.2%` (`17,382.42 ha`) in 2022 (dipping to `75.4%` in 2019), while woodland changed from `1.4%` (`195.03 ha`) in 2017 to `0.7%` (`145.35 ha`) in 2022 and open forest changed from `17.9%` (`2,532.6 ha`) in 2017 to `11.1%` (`2,187.72 ha`) in 2022[cite: 17, 27].
- **Flooded vs. Non-Flooded Mangroves:** Flooded mangrove area in the report's chart/series rose from `28.53 ha` in 2017 to `82.26 ha` in 2022 ($R^2 = 0.6355$; Section 3.1.2 text notes `20.53 ha` in 2017 to `82.26 ha` in 2022, and Section 4 text notes `28.25 ha` in 2017 to `82.26 ha` in 2017 [typo in report text]), whereas non-flooded mangrove area in Figure 7 is shown rising from `14,202.99 ha` in 2017 to `19,738.98 ha` in 2022 ($R^2 = 0.4009$)[cite: 28, 29].
