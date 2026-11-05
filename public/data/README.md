# Map boundary data

`nepal-districts-2020.geojson` and `nepal-outline-2020.geojson` are derived from the district geometry in [l3lackcurtains/nepali-geo-pro-max](https://github.com/l3lackcurtains/nepali-geo-pro-max), released under the included MIT license. Its dataset documents the May 2020 Nepal political-map outline, including Kalapani, Lipulekh, and Limpiyadhura in Darchula. Darchula is styled distinctly so the extended outline is visible. This is Nepal's published map position; the international boundary in this area is disputed. The map masks the OSM basemap outside Nepal and highlights Sudurpashchim.

`sudurpaschim-districts.simplified.geojson` is the nine-district geometry published in [Niteshh-DeV/Drishya](https://github.com/Niteshh-DeV/Drishya/tree/main/map-data). The map reads its district reference points to place and count records from the app's full heritage dataset. Since records don't contain verified site coordinates, pins represent approximate district locations; marker popups list the matching records.

The interactive basemap tiles come from OpenStreetMap. Leaflet displays the required `© OpenStreetMap contributors` attribution directly on the map. Tile usage follows the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/): tiles are requested only for the visible interactive map and are not prefetched or bulk-downloaded.
