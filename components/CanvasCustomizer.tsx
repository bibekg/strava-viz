import { css } from "@emotion/react"
import Box from "components/Box"
import Button from "components/Button"
import * as Form from "components/Form"
import {
  BoundsDrawn,
  Props as RouteMapProps,
  RouteMap,
  RouteMapDoneDrawingCallback,
  RouteMapRef,
} from "components/RouteMap"
import * as Text from "components/Text"
import dateFormat from "dateformat"
import * as React from "react"
import { AlphaPicker, CompactPicker, RGBColor } from "react-color"
import { Controller, useForm } from "react-hook-form"
import { colors } from "styles"
import shadows from "styles/shadows"
import { GeoBounds } from "types/geo"
import { SummaryActivity } from "types/strava"
import { ActivityType } from "types/strava/enums"
import { FALLBACK_GEO_BOUNDS, getGeoBoundsForRoutes } from "utils/geo"
import { activitiesToRoutes, activityTypeEmojis } from "utils/strava"
import { hasOwnProperty } from "utils/typecheck"
import Image from "./Image"
import Link from "./Link"
import SegmentedController, { TabActionType } from "./SegmentedController"

const geoBoundsMemo: Record<string, GeoBounds> = {}
const memoizedGeoBounds = (bounds: GeoBounds) => {
  const key = [
    bounds.leftLon,
    bounds.rightLon,
    bounds.upperLat,
    bounds.lowerLat,
  ].join("-")
  if (!geoBoundsMemo.hasOwnProperty(key)) {
    geoBoundsMemo[key] = bounds
  }
  return geoBoundsMemo[key]
}

const makeColorString = (color: RGBColor) =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`

const resolutionOptions = [
  { value: 0.1, label: "Low" },
  { value: 0.25, label: "Medium" },
  { value: 1.0, label: "High" },
]

interface ActivityFilteringOptions {
  startDate: string
  endDate: string
  activityTypes: Array<ActivityType>
}
interface VisualizationOptions extends GeoBounds {
  useCustomCoords: boolean
  thickness: number
  mapResolution: number
  pathResolution: number
  bgColor: RGBColor | null
  pathColor: RGBColor
}

interface CustomizationOptions
  extends ActivityFilteringOptions,
    VisualizationOptions {}

interface Props {
  activities: Array<SummaryActivity>
}

const getActivityTypeLabel = (activityType: ActivityType) =>
  `${activityTypeEmojis[activityType]} ${activityType}`

const toTimestamp = (d: Date | string) => new Date(d).getTime() / 1000

const optionsFromQueryParams = (() => {
  // Skip this for server-side rendering calls
  if (!process.browser) {
    return {}
  }
  const params = new URLSearchParams(window.location.search)
  const leftLon = params.get("leftLon")
  const rightLon = params.get("rightLon")
  const upperLat = params.get("upperLat")
  const lowerLat = params.get("lowerLat")
  const useCustomCoords =
    leftLon != null && rightLon != null && upperLat != null && lowerLat != null

  return {
    startDate: params.get("startDate") ?? undefined,
    endDate: params.get("endDate") ?? undefined,
    activityTypes: (params
      .get("activityTypes")
      ?.split(",")
      .filter((at) => hasOwnProperty(activityTypeEmojis, at)) ?? undefined) as
      | Array<ActivityType>
      | undefined,
    geoBounds: useCustomCoords
      ? {
          leftLon: Number(leftLon),
          rightLon: Number(rightLon),
          upperLat: Number(upperLat),
          lowerLat: Number(lowerLat),
        }
      : null,
    useCustomCoords: useCustomCoords,
  }
})()

export const CanvasCustomizer = ({ activities }: Props) => {
  const [imageResolution, setImageResolution] = React.useState<{
    width: number
    height: number
  } | null>(null)

  const [isDrawing, setIsDrawing] = React.useState(true)

  const routeMapRef = React.useRef<RouteMapRef | null>(null)

  const routes = React.useMemo(() => activitiesToRoutes(activities), [
    activities,
  ])

  const geoBoundsForProvidedRoutes = React.useMemo(
    () => getGeoBoundsForRoutes(routes),
    [routes]
  )

  // Generate list of activity type options {value, label} that there are activities for
  const activityTypeOptions: Array<{
    value: ActivityType
    label: string
  }> = activities
    .map((activity) => activity.type)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .map((item) => ({
      value: item,
      label: getActivityTypeLabel(item),
    }))

  const defaultValues: CustomizationOptions = {
    activityTypes:
      optionsFromQueryParams.activityTypes ??
      activityTypeOptions.map((o) => o.value),
    startDate: optionsFromQueryParams.startDate ?? "2020-01-01",
    endDate:
      optionsFromQueryParams.endDate ?? new Date().toISOString().substr(0, 10),
    thickness: 0.5,
    mapResolution: resolutionOptions[1].value,
    pathResolution: 1,
    bgColor: { r: 255, g: 255, b: 255, a: 1.0 },
    pathColor: { r: 0, g: 0, b: 0, a: 0.2 },
    useCustomCoords: optionsFromQueryParams.useCustomCoords ?? false,
    ...FALLBACK_GEO_BOUNDS,
    // This may or may not be present and override FALLBACK_GEO_BOUNDS
    ...geoBoundsForProvidedRoutes,
    ...optionsFromQueryParams.geoBounds,
  }
  const [mode, setMode] = React.useState<"routes" | "visualization">("routes")
  const {
    register,
    watch,
    control,
    handleSubmit,
    setValue,
  } = useForm<CustomizationOptions>({
    mode: "onChange",
    defaultValues,
  })
  const values = watch()

  const routesToRender = React.useMemo(() => {
    console.log("routesToRender")
    return routes.filter(
      (route) =>
        // Filter for date range
        toTimestamp(route.startDate) > toTimestamp(values.startDate) &&
        toTimestamp(route.startDate) < toTimestamp(values.endDate) &&
        // Filter for activity type
        values.activityTypes.includes(route.type) &&
        // If user wants to use custom coords, filter using those
        (!values.useCustomCoords ||
          route.waypoints.some(
            (waypoint) =>
              waypoint.lat > values.lowerLat &&
              waypoint.lat < values.upperLat &&
              waypoint.lon > values.leftLon &&
              waypoint.lon < values.rightLon
          ))
    )
  }, [
    routes,
    values.startDate,
    values.endDate,
    // Need to turn array into a string so memoization works since identically-populated but distinct arrays won't pass the === test
    values.activityTypes.join("&"),
    values.leftLon,
    values.rightLon,
    values.upperLat,
    values.lowerLat,
    values.useCustomCoords,
  ])

  // When we've determined a new set of routes to render, if the user isn't specifying
  // custom coords, recalculate the geo bounds for the routes and update the form fields
  React.useEffect(() => {
    if (!values.useCustomCoords) {
      const autoGeneratedBounds = getGeoBoundsForRoutes(routesToRender)
      if (
        autoGeneratedBounds?.leftLon !== values.leftLon ||
        autoGeneratedBounds?.rightLon !== values.rightLon ||
        autoGeneratedBounds?.upperLat !== values.upperLat ||
        autoGeneratedBounds?.lowerLat !== values.lowerLat
      ) {
        setValue(
          "leftLon",
          autoGeneratedBounds?.leftLon ?? FALLBACK_GEO_BOUNDS.leftLon
        )
        setValue(
          "rightLon",
          autoGeneratedBounds?.rightLon ?? FALLBACK_GEO_BOUNDS.rightLon
        )
        setValue(
          "upperLat",
          autoGeneratedBounds?.upperLat ?? FALLBACK_GEO_BOUNDS.upperLat
        )
        setValue(
          "lowerLat",
          autoGeneratedBounds?.lowerLat ?? FALLBACK_GEO_BOUNDS.lowerLat
        )
      }
    }
  }, [routesToRender, values.useCustomCoords])

  const updateQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search)
    queryParams.set("startDate", values.startDate)
    queryParams.set("endDate", values.endDate)
    queryParams.set("activityTypes", values.activityTypes.join(","))
    if (values.useCustomCoords) {
      queryParams.set("leftLon", String(values.leftLon))
      queryParams.set("rightLon", String(values.rightLon))
      queryParams.set("upperLat", String(values.upperLat))
      queryParams.set("lowerLat", String(values.lowerLat))
    } else {
      queryParams.delete("leftLon")
      queryParams.delete("rightLon")
      queryParams.delete("upperLat")
      queryParams.delete("lowerLat")
    }
    window.history.replaceState(null, "", `?${queryParams.toString()}`)
  }

  const routeMapProps = React.useMemo(() => {
    updateQueryParams()
    return {
      routes: routesToRender,
      geoBounds: memoizedGeoBounds({
        leftLon: values.leftLon,
        rightLon: values.rightLon,
        upperLat: values.upperLat,
        lowerLat: values.lowerLat,
      }),
      thickness: values.thickness,
      pathResolution: values.pathResolution,
      mapResolution: values.mapResolution,
      bgColor: values.bgColor ? makeColorString(values.bgColor) : null,
      pathColor: makeColorString(values.pathColor),
    }
  }, [
    routesToRender,
    values.leftLon,
    values.rightLon,
    values.upperLat,
    values.lowerLat,
    values.thickness,
    values.pathResolution,
    values.mapResolution,
    values.bgColor,
    values.pathColor,
  ])

  const handleRouteMapDoneDrawing: RouteMapDoneDrawingCallback = React.useCallback(
    ({ resolution }) => {
      setImageResolution(resolution)
      setIsDrawing(false)
    },
    [setImageResolution, setIsDrawing]
  )

  const handleBoundsDrawn = (bounds: GeoBounds) => {
    const { upperLat, lowerLat, leftLon, rightLon } = bounds

    setValue("useCustomCoords", true)
    setValue("upperLat", upperLat)
    setValue("lowerLat", lowerLat)
    setValue("leftLon", leftLon)
    setValue("rightLon", rightLon)
  }

  return (
    <Box
      display="grid"
      gridTemplateColumns="380px 300px 1fr"
      gridTemplateRows="auto auto 1fr"
      height="100vh"
      gridTemplateAreas={`
      "header header map"
      "options routeList map"
      "summary summary map"
    `}
    >
      <Box
        gridArea="header"
        display="grid"
        gridTemplateColumns="1fr"
        gridTemplateRows="auto auto 1fr auto"
        width="100%"
        bg={colors.offWhite}
        flexShrink={0}
      >
        <Box p={3} bg="white">
          <Text.PageHeader color={colors.primaryGreen}>
            The Athlete's Canvas
          </Text.PageHeader>
          <Text.Body3>
            Create a minimalist heatmap of your activities. After tweaking the
            visualization to your preferences, you can right-click and save it
            to a PNG.
          </Text.Body3>
        </Box>
      </Box>

      {/* Options */}
      <Box
        gridArea="options"
        flexGrow={0}
        overflow="auto"
        bg={colors.offWhite}
        borderTop={`1px solid ${colors.africanElephant}`}
        borderBottom={`1px solid ${colors.africanElephant}`}
        p={3}
      >
        {/* SegmentedController */}

        <Box mb={3}>
          <SegmentedController
            tabs={[
              {
                id: "routes",
                title: "Select activities",
                actionType: TabActionType.OnClick,
                onClick: () => setMode("routes"),
              },
              {
                id: "visualization",
                title: "Configure canvas",
                actionType: TabActionType.OnClick,
                onClick: () => setMode("visualization"),
              },
            ]}
            selectedTabId={mode}
          />
        </Box>

        <Form.Form id="customizations">
          {/* Activity filtering options */}
          <Box
            display={mode === "routes" ? "grid" : "none"}
            gridTemplateAreas={`
                  "startDate endDate"
                  "activityTypes activityTypes"
                  "useCustomCoords useCustomCoords"
                  "leftLon rightLon"
                  "upperLat lowerLat"
                  "reset reset"
                `}
            gridTemplateColumns="1fr 1fr"
            gridTemplateRows="auto"
            placeContent="start"
            gridRowGap={4}
            gridColumnGap={2}
            flexShrink={0}
            flexGrow={0}
            width="100%"
          >
            <Form.Item gridArea="startDate">
              <Form.Label>Start date</Form.Label>
              <Form.Input name="startDate" type="date" ref={register()} />
            </Form.Item>
            <Form.Item gridArea="endDate">
              <Form.Label>End date</Form.Label>
              <Form.Input name="endDate" type="date" ref={register()} />
            </Form.Item>
            <Form.Item gridArea="activityTypes">
              <Form.Label>Activity Types</Form.Label>
              {activityTypeOptions.map((option) => (
                <Box display="flex" key={option.value}>
                  <Form.Input
                    type="checkbox"
                    name="activityTypes"
                    value={option.value}
                    ref={register()}
                  />
                  <Text.Body3 ml={2}>{option.label}</Text.Body3>
                </Box>
              ))}
            </Form.Item>
            <Form.Item gridArea="useCustomCoords">
              <Form.Label>Coordinate bounds</Form.Label>
              <Form.FieldDescription>
                Click + drag on the map to zoom into a specific area or enter
                specific coordinates here.
              </Form.FieldDescription>
              <Form.Input
                ref={register()}
                name="useCustomCoords"
                type="checkbox"
                hidden
              />
            </Form.Item>

            <Form.Item gridArea="leftLon">
              <Form.Label>Left Longitude</Form.Label>
              <Form.Input
                name="leftLon"
                type="number"
                ref={register({ valueAsNumber: true })}
                min={-180}
                max={values.rightLon}
                step="any"
              />
            </Form.Item>
            <Form.Item gridArea="rightLon">
              <Form.Label>Right Longitude</Form.Label>
              <Form.Input
                name="rightLon"
                type="number"
                ref={register({ valueAsNumber: true })}
                min={values.leftLon}
                max={180}
                step="any"
              />
            </Form.Item>
            <Form.Item gridArea="upperLat">
              <Form.Label>Upper Latitude</Form.Label>
              <Form.Input
                name="upperLat"
                type="number"
                ref={register({ valueAsNumber: true })}
                min={values.lowerLat}
                max={90}
                step="any"
              />
            </Form.Item>
            <Form.Item gridArea="lowerLat">
              <Form.Label>Lower Latitude</Form.Label>
              <Form.Input
                name="lowerLat"
                type="number"
                ref={register({ valueAsNumber: true })}
                min={-90}
                max={values.upperLat}
                step="any"
              />
            </Form.Item>
            <Button
              gridArea="reset"
              variant="secondary"
              type="button"
              onClick={() => setValue("useCustomCoords", false)}
            >
              Reset map
            </Button>
          </Box>
          {/* Visualization Options */}

          <Box
            display={mode === "visualization" ? "grid" : "none"}
            gridTemplateAreas={`
                "mapResolution mapResolution"
                "thickness thickness"
                "bgColor bgColor"
                "pathColor pathColor"
                `}
            gridTemplateColumns="1fr 1fr"
            gridTemplateRows="auto"
            placeContent="start"
            gridRowGap={4}
            gridColumnGap={2}
            flexShrink={0}
            flexGrow={0}
            width="100%"
          >
            <Form.Item gridArea="thickness">
              <Form.Label>Line Thickness</Form.Label>
              <Form.FieldDescription>
                Controls how thick the route path lines are.
              </Form.FieldDescription>
              <Form.Input
                name="thickness"
                type="range"
                ref={register({ valueAsNumber: true })}
                min={0.1}
                max={1}
                step={0.1}
              />
            </Form.Item>
            <Form.Item gridArea="mapResolution">
              <Form.Label>Map Resolution</Form.Label>
              <Form.FieldDescription>
                Controls the resolution of the image, relative to the amount of
                geographical area the map covers. The maximum width is 20,000
                pixels.
              </Form.FieldDescription>

              <Form.Select
                name="mapResolution"
                ref={register({ valueAsNumber: true })}
              >
                {resolutionOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Form.Select>
              {imageResolution && (
                <Text.Body3 mt={2}>
                  Current Resolution:{" "}
                  <span css={css({ fontWeight: 500 })}>
                    {imageResolution.width} x {imageResolution.height}
                  </span>
                </Text.Body3>
              )}
            </Form.Item>
            <Form.Item gridArea="bgColor">
              <Form.Label>Background Color</Form.Label>
              <Controller
                name="bgColor"
                control={control}
                render={(props) => (
                  <>
                    <CompactPicker
                      css={css({
                        width: "100% !important",
                      })}
                      color={props.value ?? undefined}
                      onChange={(color) => props.onChange(color.rgb)}
                    />
                    <AlphaPicker
                      css={css({
                        width: "100% !important",
                        marginTop: "8px",
                      })}
                      color={props.value ?? undefined}
                      onChange={(color) => props.onChange(color.rgb)}
                    />
                  </>
                )}
              />
            </Form.Item>
            <Form.Item gridArea="pathColor">
              <Form.Label>Path Color</Form.Label>
              <Controller
                name="pathColor"
                control={control}
                render={(props) => (
                  <>
                    <CompactPicker
                      css={css({
                        width: "100% !important",
                        fontFamily: "Rubik !important",
                      })}
                      color={props.value ?? undefined}
                      onChange={(color) => props.onChange(color.rgb)}
                    />
                    <AlphaPicker
                      css={css({
                        width: "100% !important",
                        marginTop: "8px",
                      })}
                      color={props.value ?? undefined}
                      onChange={(color) => props.onChange(color.rgb)}
                    />
                  </>
                )}
              />
            </Form.Item>
          </Box>
        </Form.Form>
      </Box>

      <Box
        gridArea="routeList"
        height="100%"
        display="grid"
        overflowY="auto"
        gridTemplateColumns="1fr"
        gridTemplateRows="1fr auto"
        borderTop={`1px solid ${colors.africanElephant}`}
        borderBottom={`1px solid ${colors.africanElephant}`}
        borderLeft={`1px solid ${colors.africanElephant}`}
        bg={colors.offWhite}
      >
        <Box
          display="flex"
          flexDirection="column"
          flex={0}
          overflowY="auto"
          p={3}
          boxShadow={shadows.inner}
        >
          {routesToRender
            // Sort activities in recent-first order
            .sort((routeA, routeB) =>
              routeB.startDate.localeCompare(routeA.startDate)
            )
            .map((route) => (
              <Box
                p={2}
                mb={2}
                flexShrink={0}
                boxShadow={shadows.knob}
                borderRadius={2}
                width="100%"
                bg="white"
              >
                <Text.Body2>
                  {activityTypeEmojis[route.type]} {route.name}
                </Text.Body2>
                <Text.Body3 color={colors.lightGray}>
                  {dateFormat(route.startDate, "mmmm d, yyyy 'at' h:MM TT")}
                </Text.Body3>
                <Link
                  key={route.id}
                  href={`https://www.strava.com/activities/${route.id}`}
                  fontSize={12}
                >
                  View activity in Strava
                </Link>
              </Box>
            ))}
        </Box>
      </Box>

      <Box gridArea="summary" bg="white" p={3}>
        <Text.Body2>
          There are {routesToRender.length} activities matching your current
          filters.
        </Text.Body2>
      </Box>

      <Box
        gridArea="map"
        flexGrow={0}
        width="100%"
        height="100%"
        overflowY="hidden"
        display="flex"
        justifyContent="center"
        alignItems="center"
        p={3}
        borderLeft={`1px solid ${colors.africanElephant}`}
        bg={colors.offWhite}
      >
        <RouteMap
          {...routeMapProps}
          // No animations for the customizer... it's too awkward to support
          animationDuration={0}
          ref={routeMapRef}
          onDoneDrawing={handleRouteMapDoneDrawing}
          onBoundsDrawn={handleBoundsDrawn}
          canvasStyles={css({
            outline: `20px solid ${colors.midnightGray}`,
            maxHeight: "calc(100vh - 40px - 2vh)",
            maxWidth: "100%",
          })}
        />
      </Box>

      <Box position="fixed" zIndex={1} bottom="10px" right="10px" width="100px">
        <Image src="/images/powered-by-strava-light.svg" />
      </Box>
    </Box>
  )
}
