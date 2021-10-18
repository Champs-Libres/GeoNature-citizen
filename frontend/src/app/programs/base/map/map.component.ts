import * as L from 'leaflet';
import { AppConfig } from '../../../../conf/app.config';

import {
    ComponentFactoryResolver,
    ElementRef,
    EventEmitter,
    Injector,
    Input,
    OnChanges,
    Output,
    SimpleChanges,
    ViewChild,
    HostListener,
} from '@angular/core';
import { Feature, FeatureCollection, Point, Position } from 'geojson';
import { MAP_CONFIG } from '../../../../conf/map.config';
import { MarkerClusterGroup } from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.locatecontrol';
import 'leaflet-gesture-handling';
import { MapService } from './map.service';

// const slider =
//     `<input id="slide" type="range" min="0" max="1" step="0.1" value="0" onchange="this.updateOpacity('foo', this.value)">`;

const makeSlider = (layerName: string): string =>
    `<input id="slide" type="range" min="0" max="1" step="0.1" value="0" onchange="this.updateOpacity(${layerName}, this.value)">`;


export const conf = {
    MAP_ID: 'obsMap',
    GEOLOCATION_HIGH_ACCURACY: false,
    BASE_LAYERS: MAP_CONFIG['BASEMAPS'].reduce((acc, baseLayer: Object) => {
        const layerConf: any = {
            name: baseLayer['name'],
            attribution: baseLayer['attribution'],
            detectRetina: baseLayer['detectRetina'],
            maxZoom: baseLayer['maxZoom'],
            bounds: baseLayer['bounds'],
            apiKey: baseLayer['apiKey'],
            layerName: baseLayer['layerName'],
            layers: baseLayer['layers'],
        };
        if (baseLayer['subdomains']) {
            layerConf.subdomains = baseLayer['subdomains'];
        }
        if (baseLayer['wms']) {
            // const legendName = `${baseLayer['name']} - ${slider}`;
            // const legendName = `${baseLayer['name']} - ${makeSlider(baseLayer['name'])}`;
            const legendName = baseLayer['name'];
            acc[legendName] = L.tileLayer.wms(baseLayer['layer'], layerConf);
        } else {
            acc[baseLayer['name']] = L.tileLayer(baseLayer['layer'], layerConf);
        }
        return acc;
    }, {}),
    DEFAULT_BASE_MAP: () => conf.BASE_LAYERS[MAP_CONFIG['DEFAULT_PROVIDER']],
    ZOOM_CONTROL_POSITION: 'topright',
    BASE_LAYER_CONTROL_POSITION: 'topright',
    BASE_LAYER_CONTROL_INIT_COLLAPSED: true,
    GEOLOCATION_CONTROL_POSITION: 'topright',
    SCALE_CONTROL_POSITION: 'bottomleft',
    NEW_OBS_MARKER_ICON: () =>
        L.icon({
            iconUrl: MAP_CONFIG['NEW_OBS_POINTER'],
            iconSize: [33, 42],
            iconAnchor: [16, 42],
        }),
    OBS_MARKER_ICON: () =>
        L.icon({
            iconUrl: MAP_CONFIG['OBS_POINTER'],
            iconSize: [33, 42],
            iconAnchor: [16, 42],
        }),
    ORANGE_MARKER_ICON: () =>
        L.icon({
            iconUrl: MAP_CONFIG['ORANGE_POINTER'],
            iconSize: [33, 42],
            iconAnchor: [16, 42],
        }),
    OBSERVATION_LAYER: () =>
        L.markerClusterGroup({
            iconCreateFunction: (clusters) => {
                const childCount = clusters.getChildCount();
                return conf.CLUSTER_MARKER_ICON(childCount);
            },
        }),
    CLUSTER_MARKER_ICON: (childCount: number) => {
        const quantifiedCssClass = (childCount: number) => {
            let c = ' marker-cluster-';
            if (childCount < 10) {
                c += 'small';
            } else if (childCount >= 10 && childCount < 100) {
                c += 'medium';
            } else {
                c += 'large';
            }
            return c;
        };
        return new L.DivIcon({
            html: `<div><span>${childCount}</span></div>`,
            className: 'marker-cluster' + quantifiedCssClass(childCount),
            iconSize: new L.Point(40, 40),
        });
    },
    PROGRAM_AREA_STYLE: (_feature) => {
        return {
            fillColor: 'transparent',
            weight: 2,
            opacity: 0.8,
            color: 'red',
            dashArray: '4',
        };
    },
};

export const updateOpacity = (e): void => {
    console.log(e);
    //console.log(opacity);
    //TODO find the layer and setOpacity
    // this.observationMap.eachLayer((l) => {
    //     console.log(l);
    //     // if (l.name === layerName) { 
    //     //     l.setOpacity(opacity);
    //     // }
    // });
}

export abstract class BaseMapComponent implements OnChanges {
    @ViewChild('map', { static: true }) map: ElementRef;
    @Input('features') features: FeatureCollection;
    @Input('program') program: FeatureCollection;
    @Output() onClick: EventEmitter<L.Point> = new EventEmitter();
    @Output() onClickLine: EventEmitter<L.Polyline> = new EventEmitter();
    @Output() onClickPolygon: EventEmitter<L.Polygon> = new EventEmitter();
    options: any;
    observationMap: L.Map;
    programMaxBounds: L.LatLngBounds;
    programArea: any;
    observationLayer: MarkerClusterGroup;
    newObsMarker: L.Marker;
    markers: {
        feature: Feature;
        marker: L.Marker<any>;
    }[] = [];
    obsPopup: Feature;
    openPopupAfterClose: boolean;
    zoomAlertTimeout: any;
    resolver: ComponentFactoryResolver;
    injector: Injector;
    mapService: MapService;
    elementRef: ElementRef;
    abstract localeId: string;
    abstract feature_id_key: string;
    abstract getPopupComponentFactory(): any;

    constructor(
        resolver: ComponentFactoryResolver,
        injector: Injector,
        mapService: MapService,
        elementRef: ElementRef,
    ) {
        this.resolver = resolver;
        this.injector = injector;
        this.mapService = mapService;
        this.elementRef = elementRef;
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!this.observationMap) {
            this.initMap(conf);
            setTimeout(() => {
                if (changes.program && changes.program.currentValue) {
                    this.loadProgramArea();
                } else if ('user-dashboard') {
                    // TODO: Creuser à quoi correspond cette condition qui n'en est pas une...
                    this.loadProgramArea();
                }
                if (changes.features && changes.features.currentValue) {
                    this.loadFeatures();
                }
            }, 600);
        } else {
            if (changes.program && changes.program.currentValue) {
                this.loadProgramArea();
            }
            if (changes.features && changes.features.currentValue) {
                this.loadFeatures();
            }
        }
    }

    makeSlider(layerName: string): string {
        const updateOpacity = (layerName: string, opacity: number): void => {
            console.log(layerName);
            console.log(opacity);
            //TODO find the layer and setOpacity
            this.observationMap.eachLayer((l) => {
                console.log(l);
                // if (l.name === layerName) { 
                //     l.setOpacity(opacity);
                // }
            });
        }
        //return `<input id="slide" type="range" min="0" max="1" step="0.1" value="0" onchange="updateOpacity('${layerName}', this.value)">`;
        //return `<input id="${layerName}" type="range" min="0" max="1" step="0.1" value="0">`;
        //return `<input id="9999" type="range" min="0" max="1" step="0.1" value="0">`;
        return `<input id="slide" type="range" min="0" max="1" step="0.1" value="0" onchange="updateOpacity">`;
    }

    prepareOverlays(options: any): L.LayerGroup {
        const overlays = {};
        for (let l in options.BASE_LAYERS) {
            const overlayName = `${l} --- ${this.makeSlider(l)}`;
            overlays[overlayName] = options.BASE_LAYERS[l];
        }
        console.log(overlays);

        return overlays;
    }

    initMap(options: any, LeafletOptions: any = {}): void {
        this.options = options;

        this.observationMap = L.map(this.map.nativeElement, {
            layers: [this.options.DEFAULT_BASE_MAP()], // TODO: add program overlay ?
            gestureHandling: true,
            ...LeafletOptions,
        });
        // TODO: inject controls with options
        this.observationMap.zoomControl.setPosition(
            this.options.ZOOM_CONTROL_POSITION
        );

        L.control
            .scale({ position: this.options.SCALE_CONTROL_POSITION })
            .addTo(this.observationMap);

        console.log(this.options.DEFAULT_BASE_MAP());
        console.log(this.options.BASE_LAYERS);

        //const overlays = this.options.BASE_LAYERS;
        const overlays = this.prepareOverlays(this.options);

        L.control
            .layers( { "OpenStreetMap": this.options.DEFAULT_BASE_MAP() }, overlays, {
                collapsed: this.options.BASE_LAYER_CONTROL_INIT_COLLAPSED,
                position: this.options.BASE_LAYER_CONTROL_POSITION,
            })
            .addTo(this.observationMap);

        const truc = this.elementRef.nativeElement.querySelector('input [type="range"]');
        console.log('truc', truc)
        if (truc) {
            truc.addEventListener('click', console.log('change!'));
        }

        const truc2 = document.querySelector('input [type="range"]');
        console.log('truc2', truc2)

        // const slider = document.getElementById('Hydrographie').addEventListener('click', (e) => {
        //     console.log(e);
        //     this.updateOpacity(e);
        // });
        // console.log(slider);
        // if (slider) {
        //     slider.addEventListener('click', (e) => {
        //         console.log(e);
        //         this.updateOpacity(e);
        //     });
        // }

        document.addEventListener('keyup', function() {
            console.log('keys pressed');
        });

        L.control
            .locate({
                icon: 'fa fa-compass',
                position: this.options.GEOLOCATION_CONTROL_POSITION,
                strings: {
                    title: MAP_CONFIG.LOCATE_CONTROL_TITLE[this.localeId]
                        ? MAP_CONFIG.LOCATE_CONTROL_TITLE[this.localeId]
                        : 'Me géolocaliser',
                },
                getLocationBounds: (locationEvent) =>
                    this.observationMap.panTo(locationEvent.latlng),
                locateOptions: {
                    enableHighAccuracy: this.options.GEOLOCATION_HIGH_ACCURACY,
                    keepCurrentZoomLevel: true,
                },
            } as any)
            .addTo(this.observationMap);

        // this.observationMap.scrollWheelZoom.disable();
        this.observationMap.on('popupclose', (_e) => {
            if (this.openPopupAfterClose && this.obsPopup) {
                this.showPopup(this.obsPopup);
            } else {
                this.obsPopup = null;
            }
            this.openPopupAfterClose = false;
        });

        const ZoomViewer = L.Control.extend({
            onAdd: () => {
                const container = L.DomUtil.create('div');
                const gauge = L.DomUtil.create('div');
                container.style.width = '200px';
                container.style.background = 'rgba(255,255,255,0.5)';
                container.style.textAlign = 'left';
                container.className = 'mb-0';
                this.observationMap.on('zoomstart zoom zoomend', (_e) => {
                    gauge.innerHTML =
                        'Zoom level: ' + this.observationMap.getZoom();
                });
                container.appendChild(gauge);
                return container;
            },
        });
        const zv = new ZoomViewer();
        zv.addTo(this.observationMap);
        zv.setPosition('bottomright');

        this.observationMap.on('click', () => {
            const elemRect = this.observationMap
                .getContainer()
                .getBoundingClientRect();
            const bodyRect = document.body.getBoundingClientRect();
            const offset = elemRect.top - bodyRect.top;
            window.scrollTo(0, offset - 120); // 120 topBarre width with padding
        });

        // if (!this.program) this.loadProgramArea();
    }

    loadProgramArea(canSubmit = true): void {
        if (this.program) {
            if (this.programArea !== undefined) {
                this.observationMap.removeLayer(this.programArea);
            }
            let programBounds: L.LatLngBounds;
            if (this.program) {
                this.programArea = L.geoJSON(this.program, {
                    style: (_feature) =>
                        this.options.PROGRAM_AREA_STYLE(_feature),
                }).addTo(this.observationMap);
                programBounds = this.programArea.getBounds();
                console.debug('programBounds', programBounds);
                this.observationMap.fitBounds(programBounds);
                // this.observationMap.setMaxBounds(programBounds);
            }

            this.newObsMarker = null;
            if (canSubmit) {
                let polyline: L.Polyline = null;
                let previousPolyline: L.Polyline = null;
                let previousLayerPoint: L.Point = null;

                let polygon: L.Polygon = null;
                let firstPolygonPoint: L.Point = null;

                const lineDraw = L.polyline([], {
                    color: '#11aa9e',
                    dashArray: '6',
                    lineCap: 'butt',
                }).addTo(this.observationMap);

                const geometryType =
                    this.program.features[0].properties.geometry_type;

                switch (geometryType){
                    case 'LINESTRING':
                        this.observationMap.on('mousemove', (e: L.LeafletMouseEvent) => {
                            if (polyline) {
                                const lastDrawPoint: L.LatLng = polyline.getLatLngs()[polyline.getLatLngs().length - 1] as L.LatLng;
                                lineDraw.setLatLngs([lastDrawPoint, e.latlng]);
                            }
                        });
                        break;
                    case 'POLYGON':
                        this.observationMap.on('mousemove', (e: L.LeafletMouseEvent) => {
                            if (polygon) {
                                const coordinates = polygon.getLatLngs() as L.LatLng[][];
                                const lastPointPolygon = coordinates[0][coordinates[0].length - 1];
                                const firstPointPolygon = coordinates[0][0];
                                lineDraw.setLatLngs([firstPointPolygon, e.latlng, lastPointPolygon]);
                            }
                        });
                        break;
                }

                this.observationMap.on('click', (e: L.LeafletMouseEvent) => {

                    const z = this.observationMap.getZoom();
                    const coords = L.point(e.latlng.lng, e.latlng.lat);

                    if (z < MAP_CONFIG.ZOOM_LEVEL_RELEVE) {
                        // this.hasZoomAlert = true;
                        L.DomUtil.addClass(
                            this.observationMap.getContainer(),
                            'observation-zoom-statement-warning'
                        );
                        if (this.zoomAlertTimeout) {
                            clearTimeout(this.zoomAlertTimeout);
                        }
                        this.zoomAlertTimeout = setTimeout(() => {
                            L.DomUtil.removeClass(
                                this.observationMap.getContainer(),
                                'observation-zoom-statement-warning'
                            );
                        }, 400);
                        return;
                    }

                    switch (geometryType) {
                        case 'POINT':
                        default:
                            if (this.newObsMarker !== null) {
                                this.observationMap.removeLayer(this.newObsMarker);
                            }
                            // PROBLEM: if program area is a concave polygon: one can still put a marker in the cavities.
                            // POSSIBLE SOLUTION: See ray casting algorithm for inspiration
                            // https://stackoverflow.com/questions/31790344/determine-if-a-point-reside-inside-a-leaflet-polygon
                            if (
                                this.program &&
                                programBounds.contains([e.latlng.lat, e.latlng.lng])
                            ) {
                                this.newObsMarker = L.marker(e.latlng, {
                                    icon: this.options.NEW_OBS_MARKER_ICON(),
                                }).addTo(this.observationMap);
                                this.mapService.changePoint(coords);
                            }
                            // emit new coordinates
                            this.onClick.emit(coords);
                            break;

                        case 'LINESTRING':
                            lineDraw.setLatLngs([]);
                            if (polyline === null) {
                                if (previousPolyline !== null){
                                    this.observationMap.removeLayer(previousPolyline);
                                }
                                polyline = L.polyline([e.latlng], {
                                    color: '#11aa9e',
                                }).addTo(this.observationMap);
                            } else {
                                if (
                                    (previousLayerPoint && e.layerPoint) ?
                                        this.arePointsSnapped(previousLayerPoint, e.layerPoint) :
                                        false
                                ) {
                                    previousPolyline = polyline;
                                    polyline.setStyle({ color: '#60b15c' });
                                    this.mapService.changeLine(polyline);
                                    this.onClickLine.emit(polyline);
                                    polyline = null;
                                } else {
                                    polyline.addLatLng(e.latlng);
                                    previousLayerPoint = e.layerPoint;
                                }
                            }
                            break;

                        case 'POLYGON':
                            lineDraw.setLatLngs([]);
                            if (polygon === null){
                                polygon = L.polygon([e.latlng], {
                                    color: '#11aa9e',
                                }).addTo(this.observationMap);
                                firstPolygonPoint = e.layerPoint;
                            } else {
                                if (this.arePointsSnapped(firstPolygonPoint, e.layerPoint)) {
                                    polygon.setStyle({ color: '#60b15c' });
                                    this.mapService.changePolygon(polygon);
                                    this.onClickPolygon.emit(polygon);
                                    polygon = null;
                                } else {
                                    polygon.addLatLng(e.latlng);
                                }
                            }
                            break;
                    }
                });
            }
            this.programMaxBounds = programBounds;
        } else {
            console.debug('this features', this.features);
            // No program -> user-dashboard -> adapt bounds to observations
            if (this.features) {
                const obsLayer = L.geoJSON(this.features);
                console.debug('obsLayerBounds', obsLayer.getBounds());
                this.observationMap.fitBounds(obsLayer.getBounds());
                this.observationMap.setZoom(Math.min(this.observationMap.getZoom(), 17)); // limit zoom (eg single feature)
            }
        }
        this.initSliders();
    }

    loadFeatures(): void {
        if (this.features && this.program) {
            const geometryType = this.program.features[0].properties.geometry_type;
            if (this.observationLayer) {
                this.observationMap.removeLayer(this.observationLayer);
            }
            this.observationLayer = this.options.OBSERVATION_LAYER();
            this.markers = [];

            const layerOptions = {
                onEachFeature: (feature, layer) => {
                    const popupContent = this.getPopupContent(feature);

                    // if (feature.properties && feature.properties.popupContent) {
                    //   popupContent += feature.properties.popupContent;
                    // }

                    layer.bindPopup(popupContent);
                },
                pointToLayer: (_feature, latlng): L.Marker => {
                    let marker: L.Marker<any> = L.marker(latlng, {
                        icon: conf.OBS_MARKER_ICON(),
                    });

                    this.markers.push({
                        feature: _feature,
                        marker: marker,
                    });
                    return marker;
                },
            };

            let pointFeatures: FeatureCollection;
            switch (geometryType){
                case 'POINT':
                default:
                    pointFeatures = this.features;
                    break;

                case 'LINESTRING':
                case 'POLYGON':
                    this.observationMap.addLayer(
                        L.geoJSON(this.features, {
                            style: function (_feature) {
                                return { color: '#11aa9e' };
                            },
                        })
                    );
                    const features = this.features.features.map((f) => {
                        const coordinates = f.geometry.type === 'LineString' ?
                            f.geometry.coordinates[0] :
                                f.geometry.type === 'Polygon' ?
                                    f.geometry.coordinates[0][0] : [0,0] as Position

                        const firstPoint: Point = {
                            type: 'Point',
                            coordinates: coordinates,
                        }
                        const newFeature: Feature = {
                            type: 'Feature',
                            properties: f.properties,
                            geometry: firstPoint,
                        }
                        return newFeature;
                    });
                    pointFeatures = {
                        type: 'FeatureCollection',
                        features: features,
                    };
                    break;
            }

            this.observationLayer.addLayer(
                L.geoJSON(pointFeatures, layerOptions)
            );
            this.observationMap.addLayer(this.observationLayer);

            this.observationLayer.on('animationend', (_e) => {
                if (this.obsPopup) {
                    this.openPopupAfterClose = true;
                    this.observationMap.closePopup();
                }
            });
        }
    }

    getPopupContent(feature): any {
        const factory = this.getPopupComponentFactory();
        const component = factory.create(this.injector);
        component.instance.data = feature.properties;
        component.changeDetectorRef.detectChanges();
        const popupContent = component.location.nativeElement;
        return popupContent;
    }

    showPopup(feature: Feature): void {
        this.obsPopup = feature;
        let marker = this.markers.find((marker) => {
            return (
                marker.feature.properties[this.feature_id_key] ==
                feature.properties[this.feature_id_key]
            );
        });
        let visibleParent: L.Marker = this.observationLayer.getVisibleParent(
            marker.marker
        );
        if (!visibleParent) {
            this.observationMap.panTo(marker.marker.getLatLng());
            visibleParent = marker.marker;
        }
        const popup = L.popup()
            .setLatLng(visibleParent.getLatLng())
            .setContent(this.getPopupContent(feature))
            .openOn(this.observationMap);
    }

    ngOnDestroy(): void {
        this.observationMap.off();
        this.observationMap.remove();
    }

    canStart(): void {}

    arePointsSnapped(pointA: L.Point, pointB: L.Point): boolean {
        const SNAP_DISTANCE = 6;
        const distancePixel = Math.sqrt(
            Math.abs((pointB.x - pointA.x) ** 2 - (pointB.y - pointA.y) ** 2)
        );
        return distancePixel < SNAP_DISTANCE;
    }

    updateOpacity(e): void {
        console.log(e);
        //console.log(opacity);
        //TODO find the layer and setOpacity
        // this.observationMap.eachLayer((l) => {
        //     console.log(l);
        //     // if (l.name === layerName) { 
        //     //     l.setOpacity(opacity);
        //     // }
        // });
    }

    initSliders(): void {
        window.addEventListener('DOMContentLoaded', (event) => {
            console.log('DOM fully loaded and parsed');
            const updateOpacity = (layerName: string, opacity: number): void => {
                console.log(layerName);
                console.log(opacity);
                //TODO find the layer and setOpacity
                this.observationMap.eachLayer((l) => {
                    console.log(l);
                    // if (l.name === layerName) { 
                    //     l.setOpacity(opacity);
                    // }
                });
            }
        });
    }
}