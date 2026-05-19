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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * Holds the state of a [DismissibleSheet]: the underlying Material3 sheet
 * state, the horizontal translation animatable used for the swipe-right
 * dismiss, and flags tracking whether the sheet was dismissed by swiping
 * right (vs. by dragging down to Hidden) and whether it had been expanded
 * at the moment of dismissal.
 *
 * Cloned, with permission, from PT MainScreen.kt's bottom-sheet pattern.
 */
@OptIn(ExperimentalMaterial3Api::class)
class DismissibleSheetState internal constructor(
    val bottomSheetState: SheetState,
    internal val sheetOffsetX: Animatable<Float, *>,
    internal val dismissedBySwipeRightState: MutableState<Boolean>,
    internal val wasExpandedWhenDismissedState: MutableState<Boolean>,
) {
    val dismissedBySwipeRight: Boolean get() = dismissedBySwipeRightState.value
    val wasExpandedWhenDismissed: Boolean get() = wasExpandedWhenDismissedState.value

    /** True when the sheet has been hidden by any means (swipe-right or drag-down to Hidden). */
    val isDismissed: Boolean
        get() = dismissedBySwipeRight ||
                bottomSheetState.currentValue == SheetValue.Hidden ||
                bottomSheetState.targetValue == SheetValue.Hidden

    /** Bring the sheet back to whichever expansion state it had at dismiss time. */
    internal suspend fun restore() {
        if (dismissedBySwipeRight) {
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
        )
    }
}

/**
 * A bottom sheet that can be dismissed by swiping right past 40% of its
 * width OR by dragging down past the peek (standard BottomSheet behaviour).
 * When dismissed, a [SmallFloatingActionButton] appears over [content] to
 * restore the sheet.
 *
 * This is the same pattern PT uses on its routing screen, lifted into the
 * shared lib so both PT and immersiveRDP behave identically.
 *
 * Restore-FAB icon and position vary with the dismiss origin:
 *  - Swipe-right dismiss: KeyboardArrowLeft at the right edge
 *    (centre-right when the sheet had been expanded, bottom-right otherwise).
 *  - Drag-down to Hidden: KeyboardArrowUp at the bottom-centre.
 *
 * @param state Hoisted state — pass [rememberDismissibleSheetState] or
 *   create your own to drive it externally (e.g. an IME-aware expand).
 * @param peekHeight Standard BottomSheetScaffold peek height.
 * @param sheetOpacity 0..1 applied to the sheet surface colour and the FAB.
 * @param sheetShape Clip shape of the sheet body.
 * @param sheetContent The contents of the sheet itself.
 * @param content Whatever lives "behind" the sheet — pass an empty Box to
 *   leave the area transparent (e.g. for overlay use over a SurfaceView).
 */
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
        // Transparent scaffold background so callers can overlay this sheet
        // over arbitrary content (e.g. immersiveRDP's RDP SurfaceView). PT,
        // which fills `content` with an opaque map, is unaffected.
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
                    .pointerInput(Unit) {
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
                    // Restore-FAB lands on the edge the sheet was dragged toward, so
                    // pulling it back goes in the opposite direction from the dismiss:
                    //   swipe-right → FAB on the right edge (CenterRight or BottomRight)
                    //   drag-down  → FAB on the top edge (TopCenter), pull down to restore
                    SmallFloatingActionButton(
                        onClick = { scope.launch { state.restore() } },
                        modifier = Modifier
                            .align(
                                if (state.dismissedBySwipeRight && state.wasExpandedWhenDismissed) AbsoluteAlignment.CenterRight
                                else if (state.dismissedBySwipeRight) AbsoluteAlignment.BottomRight
                                else Alignment.TopCenter
                            )
                            .absolutePadding(
                                top = if (!state.dismissedBySwipeRight) 16.dp else 0.dp,
                                right = if (state.dismissedBySwipeRight) 4.dp else 0.dp,
                                bottom = if (state.dismissedBySwipeRight && state.wasExpandedWhenDismissed) 0.dp
                                         else if (state.dismissedBySwipeRight) 120.dp
                                         else 0.dp,
                            ),
                        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = sheetOpacity),
                        elevation = FloatingActionButtonDefaults.elevation(4.dp),
                    ) {
                        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                            Icon(
                                if (state.dismissedBySwipeRight) Icons.AutoMirrored.Filled.KeyboardArrowLeft
                                else Icons.Default.KeyboardArrowDown,
                                contentDescription = null,
                            )
                        }
                    }
                }
            }
        },
    )
}
