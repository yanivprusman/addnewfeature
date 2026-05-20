package com.automatelinux.feedbacklib.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.absolutePadding
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.abs

enum class SheetOrientation { AUTO, PORTRAIT, LANDSCAPE }

@OptIn(ExperimentalMaterial3Api::class)
class DismissibleSheetState internal constructor(
    val bottomSheetState: SheetState,
    internal val sheetOffsetX: Animatable<Float, *>,
    internal val dismissedBySwipeRightState: MutableState<Boolean>,
    internal val wasExpandedWhenDismissedState: MutableState<Boolean>,
    internal val snapped: Boolean = false,
) {
    val dismissedBySwipeRight: Boolean get() = dismissedBySwipeRightState.value
    val wasExpandedWhenDismissed: Boolean get() = wasExpandedWhenDismissedState.value

    val isDismissed: Boolean
        get() = dismissedBySwipeRight ||
                bottomSheetState.currentValue == SheetValue.Hidden ||
                bottomSheetState.targetValue == SheetValue.Hidden ||
                (snapped && (
                        bottomSheetState.currentValue == SheetValue.PartiallyExpanded ||
                                bottomSheetState.targetValue == SheetValue.PartiallyExpanded
                        ))

    suspend fun hide() {
        bottomSheetState.hide()
    }

    internal suspend fun restore() {
        if (snapped) {
            bottomSheetState.expand()
            sheetOffsetX.animateTo(0f)
            dismissedBySwipeRightState.value = false
        } else if (dismissedBySwipeRight) {
            if (wasExpandedWhenDismissed) bottomSheetState.expand()
            else bottomSheetState.partialExpand()
            sheetOffsetX.animateTo(0f)
            dismissedBySwipeRightState.value = false
        } else {
            bottomSheetState.partialExpand()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun rememberDismissibleSheetState(
    initialValue: SheetValue = SheetValue.PartiallyExpanded,
    skipHiddenState: Boolean = false,
    snapped: Boolean = false,
): DismissibleSheetState {
    val bottomSheetState = rememberStandardBottomSheetState(
        initialValue = initialValue,
        skipHiddenState = skipHiddenState,
    )
    val sheetOffsetX = remember { Animatable(0f) }
    val dismissedBySwipeRight = remember { mutableStateOf(false) }
    val wasExpandedWhenDismissed = remember { mutableStateOf(false) }
    return remember(bottomSheetState) {
        DismissibleSheetState(
            bottomSheetState = bottomSheetState,
            sheetOffsetX = sheetOffsetX,
            dismissedBySwipeRightState = dismissedBySwipeRight,
            wasExpandedWhenDismissedState = wasExpandedWhenDismissed,
            snapped = snapped,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DismissibleSheet(
    sheetContent: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
    modifier: Modifier = Modifier,
    state: DismissibleSheetState = rememberDismissibleSheetState(),
    peekHeight: Dp = 280.dp,
    sheetOpacity: Float = 1f,
    sheetShape: Shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
    dragDownRestoreAlignment: Alignment = Alignment.BottomCenter,
    dragDownRestoreIcon: ImageVector = Icons.Default.KeyboardArrowUp,
    dragDownRestoreOpacity: Float = sheetOpacity,
    sheetOrientation: SheetOrientation = SheetOrientation.AUTO,
    swipeRightEnabled: Boolean = true,
) {
    val config = LocalConfiguration.current
    val deviceIsLandscape = config.screenWidthDp > config.screenHeightDp
    val needsRotation = when (sheetOrientation) {
        SheetOrientation.PORTRAIT -> deviceIsLandscape
        SheetOrientation.LANDSCAPE -> !deviceIsLandscape
        SheetOrientation.AUTO -> false
    }

    if (needsRotation) {
        RightEdgeSheet(
            sheetContent = sheetContent,
            content = content,
            modifier = modifier,
            state = state,
            peekHeight = peekHeight,
            sheetOpacity = sheetOpacity,
            sheetShape = sheetShape,
            dragDownRestoreAlignment = dragDownRestoreAlignment,
            dragDownRestoreIcon = dragDownRestoreIcon,
            dragDownRestoreOpacity = dragDownRestoreOpacity,
            swipeRightEnabled = swipeRightEnabled,
        )
    } else {
        Sheet(
            sheetContent = sheetContent,
            content = content,
            modifier = modifier,
            state = state,
            peekHeight = peekHeight,
            sheetOpacity = sheetOpacity,
            sheetShape = sheetShape,
            dragDownRestoreAlignment = dragDownRestoreAlignment,
            dragDownRestoreIcon = dragDownRestoreIcon,
            dragDownRestoreOpacity = dragDownRestoreOpacity,
            swipeRightEnabled = swipeRightEnabled,
        )
    }
}

/**
 * Rotation wrapper for landscape-locked activities held in portrait.
 * Swaps layout constraints to portrait and rotates -90° via [graphicsLayer].
 * Inside, the SAME [BottomSheet] composable runs unchanged — all gestures
 * (drag-down, swipe-right, restore FAB) work because graphicsLayer
 * inverse-transforms touch events.
 */
@Composable
private fun RightEdgeSheet(
    sheetContent: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
    modifier: Modifier,
    state: DismissibleSheetState,
    peekHeight: Dp,
    sheetOpacity: Float,
    sheetShape: Shape,
    dragDownRestoreAlignment: Alignment,
    dragDownRestoreIcon: ImageVector,
    dragDownRestoreOpacity: Float,
    swipeRightEnabled: Boolean,
) {
    val config = LocalConfiguration.current
    val pivotFractionY = config.screenHeightDp.toFloat() / (2f * config.screenWidthDp)

    Box(modifier = modifier.fillMaxSize()) {
        content(PaddingValues())

        Box(
            modifier = Modifier
                .fillMaxSize()
                .layout { measurable, constraints ->
                    val portraitConstraints = Constraints(
                        minWidth = constraints.minHeight,
                        maxWidth = constraints.maxHeight,
                        minHeight = constraints.minWidth,
                        maxHeight = constraints.maxWidth,
                    )
                    val placeable = measurable.measure(portraitConstraints)
                    layout(constraints.maxWidth, constraints.maxHeight) {
                        placeable.place(x = 0, y = 0)
                    }
                }
                .graphicsLayer {
                    rotationZ = -90f
                    transformOrigin = TransformOrigin(0.5f, pivotFractionY)
                }
        ) {
            Sheet(
                sheetContent = sheetContent,
                content = { _ -> Box(Modifier.fillMaxSize()) },
                modifier = Modifier.fillMaxSize(),
                state = state,
                peekHeight = peekHeight,
                sheetOpacity = sheetOpacity,
                sheetShape = sheetShape,
                dragDownRestoreAlignment = dragDownRestoreAlignment,
                dragDownRestoreIcon = dragDownRestoreIcon,
                dragDownRestoreOpacity = dragDownRestoreOpacity,
                swipeRightEnabled = swipeRightEnabled,
            )
        }
    }
}

/** Standard bottom-edge sheet — the original BottomSheetScaffold implementation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet(
    sheetContent: @Composable () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
    modifier: Modifier,
    state: DismissibleSheetState,
    peekHeight: Dp,
    sheetOpacity: Float,
    sheetShape: Shape,
    dragDownRestoreAlignment: Alignment,
    dragDownRestoreIcon: ImageVector,
    dragDownRestoreOpacity: Float,
    swipeRightEnabled: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    val viewConfiguration = LocalViewConfiguration.current
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = state.bottomSheetState)

    BottomSheetScaffold(
        modifier = modifier,
        scaffoldState = scaffoldState,
        sheetPeekHeight = peekHeight,
        sheetDragHandle = { },
        sheetContainerColor = Color.Transparent,
        sheetShadowElevation = 0.dp,
        sheetMaxWidth = Dp.Unspecified,
        containerColor = Color.Transparent,
        contentColor = MaterialTheme.colorScheme.onSurface,
        sheetContent = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight()
                    .graphicsLayer { translationX = state.sheetOffsetX.value }
                    .clip(sheetShape)
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = sheetOpacity))
                    .pointerInput(swipeRightEnabled) {
                        if (!swipeRightEnabled) return@pointerInput
                        val dismissThreshold = size.width * 0.4f
                        awaitEachGesture {
                            awaitFirstDown(pass = PointerEventPass.Initial)
                            var cumX = 0f
                            var cumY = 0f
                            var claimed = false
                            while (true) {
                                val event = awaitPointerEvent(pass = PointerEventPass.Initial)
                                val change = event.changes.firstOrNull() ?: break
                                if (!change.pressed) {
                                    if (claimed) {
                                        if (state.sheetOffsetX.value > dismissThreshold) {
                                            state.dismissedBySwipeRightState.value = true
                                            state.wasExpandedWhenDismissedState.value =
                                                state.bottomSheetState.currentValue == SheetValue.Expanded
                                            scope.launch {
                                                state.sheetOffsetX.animateTo(size.width.toFloat())
                                                state.bottomSheetState.hide()
                                            }
                                        } else {
                                            scope.launch { state.sheetOffsetX.animateTo(0f) }
                                        }
                                    }
                                    break
                                }
                                val delta = change.positionChange()
                                cumX += delta.x
                                cumY += delta.y
                                if (!claimed) {
                                    if (abs(cumX) > viewConfiguration.touchSlop ||
                                        abs(cumY) > viewConfiguration.touchSlop
                                    ) {
                                        if (cumX > abs(cumY)) {
                                            claimed = true
                                            change.consume()
                                        } else {
                                            break
                                        }
                                    }
                                } else {
                                    change.consume()
                                    scope.launch {
                                        state.sheetOffsetX.snapTo(
                                            (state.sheetOffsetX.value + delta.x).coerceAtLeast(0f)
                                        )
                                    }
                                }
                            }
                        }
                    }
            ) {
                sheetContent()
            }
        },
        content = { padding ->
            Box(modifier = Modifier.fillMaxSize()) {
                content(padding)

                if (state.isDismissed) {
                    val dragDownIsTop = dragDownRestoreAlignment == Alignment.TopCenter
                    SmallFloatingActionButton(
                        onClick = { scope.launch { state.restore() } },
                        modifier = Modifier
                            .align(
                                if (state.dismissedBySwipeRight && state.wasExpandedWhenDismissed) AbsoluteAlignment.CenterRight
                                else if (state.dismissedBySwipeRight) AbsoluteAlignment.BottomRight
                                else dragDownRestoreAlignment
                            )
                            .absolutePadding(
                                top = if (!state.dismissedBySwipeRight && dragDownIsTop) 16.dp else 0.dp,
                                right = if (state.dismissedBySwipeRight) 4.dp else 0.dp,
                                bottom = if (state.dismissedBySwipeRight && state.wasExpandedWhenDismissed) 0.dp
                                         else if (state.dismissedBySwipeRight) 120.dp
                                         else if (!dragDownIsTop) 16.dp
                                         else 0.dp,
                            ),
                        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = dragDownRestoreOpacity),
                        elevation = FloatingActionButtonDefaults.elevation(4.dp),
                    ) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Icon(
                                if (state.dismissedBySwipeRight) Icons.AutoMirrored.Filled.KeyboardArrowLeft
                                else dragDownRestoreIcon,
                                contentDescription = null,
                            )
                        }
                    }
                }
            }
        },
    )
}
