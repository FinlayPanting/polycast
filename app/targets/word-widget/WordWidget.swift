import SwiftUI
import WidgetKit

// A word from your shows (PC-1025-08). The app writes up to 30 saved words to the shared App Group
// (app/src/lib/wordWidget.ts); the widget shows one a day, picked the same way as wordOfTheDay in
// app/src/lib/wordWidgetCore.ts, and a tap opens it in the app with the host's clip.

let appGroup = "group.com.finlaypanting.polycast"
let wordsKey = "widgetWords"

struct WidgetWord: Codable {
  let lemma: String
  let sentence: String
  let meaning: String
  let language: String
}

struct WordEntry: TimelineEntry {
  let date: Date
  let word: WidgetWord?
}

/// Days since 1 January 1970 on the phone's own calendar, so the word changes at local midnight.
func localDayNumber(_ date: Date) -> Int {
  let offset = TimeZone.current.secondsFromGMT(for: date)
  return Int(floor((date.timeIntervalSince1970 + Double(offset)) / 86400))
}

func wordOfTheDay(_ words: [WidgetWord], _ date: Date) -> WidgetWord? {
  guard !words.isEmpty else { return nil }
  let n = localDayNumber(date) % words.count
  return words[n < 0 ? n + words.count : n]
}

func savedWords() -> [WidgetWord] {
  guard let json = UserDefaults(suiteName: appGroup)?.string(forKey: wordsKey), let data = json.data(using: .utf8) else { return [] }
  return (try? JSONDecoder().decode([WidgetWord].self, from: data)) ?? []
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> WordEntry {
    WordEntry(date: Date(), word: WidgetWord(lemma: "fika", sentence: "Ska vi ta en fika?", meaning: "a coffee break", language: "sv"))
  }

  func getSnapshot(in context: Context, completion: @escaping (WordEntry) -> Void) {
    let words = savedWords()
    completion(words.isEmpty ? placeholder(in: context) : WordEntry(date: Date(), word: wordOfTheDay(words, Date())))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WordEntry>) -> Void) {
    let now = Date()
    let words = savedWords()
    let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86400))
    let entries = [WordEntry(date: now, word: wordOfTheDay(words, now)), WordEntry(date: midnight, word: wordOfTheDay(words, midnight))]
    completion(Timeline(entries: entries, policy: .after(midnight)))
  }
}

func wordLink(_ w: WidgetWord) -> URL? {
  var c = URLComponents()
  c.scheme = "polycast"
  c.host = "word"
  c.queryItems = [URLQueryItem(name: "lemma", value: w.lemma), URLQueryItem(name: "language", value: w.language)]
  return c.url
}

struct WordWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: WordEntry

  var body: some View {
    Group {
      if let w = entry.word {
        VStack(alignment: .leading, spacing: 4) {
          Text(w.lemma).font(.system(size: family == .systemSmall ? 24 : 28, weight: .bold)).lineLimit(1).minimumScaleFactor(0.6)
          Text(w.meaning).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
          Spacer(minLength: 0)
          Text("“\(w.sentence)”").font(.caption).italic().lineLimit(family == .systemSmall ? 2 : 3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(wordLink(w))
      } else {
        VStack(alignment: .leading, spacing: 4) {
          Text("Your words").font(.headline)
          Text("Save a word while you listen and it shows up here.").font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
    .containerBackground(.fill.tertiary, for: .widget)
  }
}

@main
struct WordWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "WordWidget", provider: Provider()) { entry in
      WordWidgetView(entry: entry)
    }
    .configurationDisplayName("A word from your shows")
    .description("One word you saved, the host’s line it came from and what it means. A new one each morning.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
