import ActivityKit
import SwiftUI
import WidgetKit

private let night = Color(red: 0x1A / 255, green: 0x1A / 255, blue: 0x30 / 255)
private let amber = Color(red: 0xFF / 255, green: 0x9C / 255, blue: 0x18 / 255)

@main
struct PolycastWidgets: WidgetBundle {
  var body: some Widget {
    LiveLineActivity()
  }
}

/// The line being said, a bar under it that iOS animates from the line's start to its end (so the
/// app sends one update per line), its translation and the next line.
struct LiveLineView: View {
  let state: PolycastLineAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(state.line)
        .font(.headline)
        .foregroundColor(.white)
        .lineLimit(2)
      ProgressView(timerInterval: state.start...max(state.end, state.start), countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .tint(amber)
      if !state.english.isEmpty {
        Text(state.english)
          .font(.subheadline)
          .foregroundColor(.white.opacity(0.75))
          .lineLimit(2)
      }
      if !state.next.isEmpty {
        Text(state.next)
          .font(.footnote)
          .foregroundColor(.white.opacity(0.5))
          .lineLimit(1)
      }
    }
  }
}

struct LiveLineActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PolycastLineAttributes.self) { context in
      LiveLineView(state: context.state)
        .padding(16)
        .activityBackgroundTint(night)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          LiveLineView(state: context.state)
        }
      } compactLeading: {
        Image(systemName: "waveform")
      } compactTrailing: {
        EmptyView()
      } minimal: {
        Image(systemName: "waveform")
      }
    }
  }
}
